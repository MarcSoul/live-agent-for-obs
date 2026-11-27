#include <obs-module.h>
#include <windows.h>
#include <wincred.h>
#pragma comment(lib, "Advapi32.lib")
#include <obs-frontend-api.h>
#include <QAction>
#include <QByteArray>
#include <QComboBox>
#include <QDialog>
#include <QSignalBlocker>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QLineEdit>
#include <QMainWindow>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkProxy>
#include <QNetworkRequest>
#include <QPointer>
#include <QProcess>
#include <QPushButton>
#include <QSettings>
#include <QTextEdit>
#include <QTextCursor>
#include <QTimer>
#include <QUrl>
#include <QVBoxLayout>
#include <functional>
#include <memory>
#include <utility>

OBS_DECLARE_MODULE()
MODULE_EXPORT const char *obs_module_name() { return "Live Agent"; }

namespace {
const QString origin = QStringLiteral("http://127.0.0.1:47831");
constexpr auto dockId = "marcsoul-live-agent";

class Panel final : public QWidget {
public:
	Panel()
	{
		network.setProxy(QNetworkProxy::NoProxy);
		auto *layout = new QVBoxLayout(this);
		log = new QTextEdit(this);
		log->setReadOnly(true);
		layout->addWidget(log);
		status = new QLabel(this);
		status->setWordWrap(true);
		layout->addWidget(status);
		prompt = new QLineEdit(this);
		prompt->setPlaceholderText(tr("Pide una escena, un grafismo o escribe /model"));
		layout->addWidget(prompt);
		auto *row = new QHBoxLayout;
		send = new QPushButton(tr("Enviar"), this);
		attach = new QPushButton(tr("Adjuntar cartel"), this);
		row->addWidget(attach);
		row->addWidget(send);
		layout->addLayout(row);
		connect(send, &QPushButton::clicked, this, [this] { submit(); });
		connect(prompt, &QLineEdit::returnPressed, this, [this] { submit(); });
		connect(attach, &QPushButton::clicked, this, [this] {
			poster = QFileDialog::getOpenFileName(this, tr("Selecciona el cartel"), {}, tr("Carteles (*.png *.jpg *.jpeg *.webp)"));
			status->setText(poster.isEmpty() ? QString{} : QFileInfo(poster).fileName());
		});
		connect(&runtime, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) {
			status->setText(tr("Live Agent no pudo iniciar el servicio local."));
		});
		connect(&runtime, &QProcess::readyReadStandardOutput, this, [this] { runtime.readAllStandardOutput(); });
		connect(&runtime, &QProcess::readyReadStandardError, this, [this] { runtime.readAllStandardError(); });
		status->setText(tr("Conecta tu cuenta en Herramientas → Live Agent: conexión."));
		QTimer::singleShot(0, this, [this] { ensureRuntime(); });
	}

	~Panel() override
	{
		if (runtime.state() != QProcess::NotRunning) {
			runtime.kill();
			runtime.waitForFinished(2000);
		}
		if (settings)
			delete settings.data();
	}

	void showSettings()
	{
		ensureRuntime();
		if (settings) {
			settings->raise();
			settings->activateWindow();
			return;
		}
		auto *window = static_cast<QMainWindow *>(obs_frontend_get_main_window());
		settings = new QDialog(window);
		settings->setAttribute(Qt::WA_DeleteOnClose);
		settings->setWindowTitle(tr("Live Agent · Conexión"));
		auto *layout = new QVBoxLayout(settings);
		auto *account = new QLabel(tr("Comprobando conexión…"), settings);
		account->setWordWrap(true);
		layout->addWidget(account);
		layout->addWidget(new QLabel(tr("Contraseña del servidor WebSocket de OBS (puerto 4455)"), settings));
		auto *secret = new QLineEdit(password, settings);
		secret->setEchoMode(QLineEdit::Password);
		layout->addWidget(secret);
		connect(secret, &QLineEdit::textChanged, this, [this](const QString &text) { password = text; });
		connect(secret, &QLineEdit::editingFinished, settings.data(), [this, account] {
			const auto bytes = password.toUtf8();
			if (bytes.isEmpty()) {
				if (!CredDeleteW(L"MarcSoul.LiveAgent.OBSWebSocket", CRED_TYPE_GENERIC, 0) && GetLastError() != ERROR_NOT_FOUND)
					account->setText(tr("Windows no pudo borrar la contraseña guardada."));
				return;
			}
			CREDENTIALW credential{};
			wchar_t target[] = L"MarcSoul.LiveAgent.OBSWebSocket";
			credential.Type = CRED_TYPE_GENERIC;
			credential.TargetName = target;
			credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
			credential.CredentialBlobSize = static_cast<DWORD>(bytes.size());
			credential.CredentialBlob = reinterpret_cast<LPBYTE>(const_cast<char *>(bytes.constData()));
			if (!CredWriteW(&credential, 0))
				account->setText(tr("Windows no pudo guardar la contraseña de OBS."));
		});
		auto *login = new QPushButton(tr("Continuar con ChatGPT"), settings);
		auto *logout = new QPushButton(tr("Desconectar"), settings);
		layout->addWidget(login);
		layout->addWidget(logout);
		auto *hint = new QLabel(tr("Se abre el navegador solo para autorizar la cuenta. Las órdenes con visión pueden enviar una captura del previo a ChatGPT."), settings);
		hint->setWordWrap(true);
		layout->addWidget(hint);
		auto *model = new QComboBox(settings);
		auto *reasoning = new QComboBox(settings);
		model->setEnabled(false);
		reasoning->setEnabled(false);
		layout->addWidget(new QLabel(tr("Modelo"), settings));
		layout->addWidget(model);
		layout->addWidget(new QLabel(tr("Nivel de razonamiento"), settings));
		layout->addWidget(reasoning);
		auto *refresh = new QPushButton(tr("Actualizar modelos"), settings);
		layout->addWidget(refresh);
		auto *credits = new QLabel(QStringLiteral("Por MarcSoul · <a href=\"https://marcsoul.com\">marcsoul.com</a>"), settings);
		credits->setOpenExternalLinks(true);
		layout->addWidget(credits);
		QPointer<QComboBox> modelBox(model), reasoningBox(reasoning);
		QPointer<QLabel> feedback(account);
		auto updatePrefs = [modelBox, reasoningBox, feedback](const QJsonObject &data, const QString &error) {
			if (!modelBox || !reasoningBox || !feedback)
				return;
			if (!error.isEmpty()) {
				feedback->setText(error);
				modelBox->setEnabled(modelBox->count() > 0);
				reasoningBox->setEnabled(reasoningBox->count() > 0);
				return;
			}
			QSignalBlocker blockModel(modelBox.data()), blockReasoning(reasoningBox.data());
			modelBox->clear();
			reasoningBox->clear();
			const auto catalog = data.value("models").toArray();
			for (const auto &entry : catalog) {
				const auto item = entry.toObject();
				modelBox->addItem(item.value("label").toString(), item.value("slug").toString());
			}
			const auto levels = data.value("levels").toArray();
			for (const auto &entry : levels)
				reasoningBox->addItem(entry.toString(), entry.toString());
			modelBox->setCurrentIndex(modelBox->findData(data.value("model").toString()));
			reasoningBox->setCurrentIndex(reasoningBox->findData(data.value("reasoning").toString()));
			modelBox->setEnabled(modelBox->count() > 0);
			reasoningBox->setEnabled(reasoningBox->count() > 0);
		};
		auto requestPrefs = [this, modelBox, reasoningBox, updatePrefs](const QJsonObject &payload) {
			if (!modelBox || !reasoningBox)
				return;
			modelBox->setEnabled(false);
			reasoningBox->setEnabled(false);
			post("/auth/preferences", payload, updatePrefs);
		};
		connect(refresh, &QPushButton::clicked, settings.data(), [requestPrefs] { requestPrefs({}); });
		connect(model, &QComboBox::activated, settings.data(), [model, requestPrefs](int index) {
			requestPrefs({{"model", model->itemData(index).toString()}});
		});
		connect(reasoning, &QComboBox::activated, settings.data(), [reasoning, requestPrefs](int index) {
			requestPrefs({{"reasoning", reasoning->itemData(index).toString()}});
		});
		QPointer<QLabel> label(account);
		auto update = [label, modelBox, reasoningBox, requestPrefs, wasConnected=std::make_shared<bool>(false)](const QJsonObject &data, const QString &error) mutable {
			if (!label)
				return;
			const bool connected = error.isEmpty() && data.value("connected").toBool();
			if (connected && !*wasConnected)
				requestPrefs({});
			if (!connected && *wasConnected && modelBox && reasoningBox) {
				modelBox->clear();
				reasoningBox->clear();
				modelBox->setEnabled(false);
				reasoningBox->setEnabled(false);
			}
			*wasConnected = connected;
			if (!error.isEmpty())
				label->setText(error);
			else if (!data.value("error").toString().isEmpty())
				label->setText(data.value("error").toString());
			else if (data.value("connected").toBool())
				label->setText(QObject::tr("Cuenta conectada: %1").arg(data.value("account").toString()));
			else if (data.value("pending").toBool())
				label->setText(QObject::tr("Autoriza en el navegador y vuelve a OBS."));
			else
				label->setText(QObject::tr("ChatGPT sin conectar"));
		};
		connect(login, &QPushButton::clicked, settings.data(), [this, update] { post("/auth/start", {}, update); });
		connect(logout, &QPushButton::clicked, settings.data(), [this, update] { post("/auth/logout", {}, update); });
		auto *poll = new QTimer(settings);
		connect(poll, &QTimer::timeout, settings.data(), [this, update] { post("/auth/status", {}, update); });
		poll->start(2500);
		settings->resize(450, 250);
		settings->show();
		post("/auth/status", {}, update);
	}

private:
	using Result = std::function<void(const QJsonObject &, const QString &)>;
	QNetworkAccessManager network;
	QProcess runtime;
	QPointer<QDialog> settings;
	QTextEdit *log;
	QLabel *status;
	QLineEdit *prompt;
	QPushButton *send;
	QPushButton *attach;
	QString password = [] {
		PCREDENTIALW credential = nullptr;
		if (!CredReadW(L"MarcSoul.LiveAgent.OBSWebSocket", CRED_TYPE_GENERIC, 0, &credential))
			return QString{};
		const auto text = QString::fromUtf8(reinterpret_cast<const char *>(credential->CredentialBlob), credential->CredentialBlobSize);
		CredFree(credential);
		return text;
	}();
	QString poster;
	bool busy = false;

	void ensureRuntime()
	{
		if (runtime.state() != QProcess::NotRunning)
			return;
		const QSettings installation(QStringLiteral("HKEY_LOCAL_MACHINE\\Software\\MarcSoul\\LiveAgent"), QSettings::NativeFormat);
		const auto root = installation.value("InstallDir").toString();
		const auto exe = root + "/runtime/node.exe";
		if (root.isEmpty() || !QFileInfo::exists(exe)) {
			status->setText(tr("Reinstala Live Agent con su instalador de Windows."));
			return;
		}
		runtime.setWorkingDirectory(root);
		runtime.setProgram(exe);
		runtime.setArguments({root + "/server.mjs"});
		runtime.setCreateProcessArgumentsModifier([](QProcess::CreateProcessArguments *args) {
			args->flags |= 0x08000000; // CREATE_NO_WINDOW
		});
		runtime.start();
	}

	void request(const QString &route, const QByteArray &contentType, const QByteArray &body, Result callback)
	{
		QNetworkRequest req{QUrl(origin + route)};
		req.setRawHeader("Origin", origin.toUtf8());
		req.setRawHeader("Content-Type", contentType);
		req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
		req.setTransferTimeout(45000);
		auto *reply = network.post(req, body);
		connect(reply, &QNetworkReply::finished, this, [reply, callback = std::move(callback)] {
			const auto data = QJsonDocument::fromJson(reply->readAll()).object();
			QString error;
			if (reply->error() != QNetworkReply::NoError)
				error = data.value("error").toString(reply->errorString());
			reply->deleteLater();
			callback(data, error);
		});
	}

	void post(const QString &route, const QJsonObject &body, Result callback)
	{
		request(route, "application/json", QJsonDocument(body).toJson(QJsonDocument::Compact), std::move(callback));
	}

	void append(const QString &line)
	{
		log->moveCursor(QTextCursor::End);
		log->insertPlainText(line + "\n\n");
		log->ensureCursorVisible();
	}

	void done(const QString &error = {})
	{
		busy = false;
		send->setEnabled(true);
		attach->setEnabled(true);
		status->setText(error);
		prompt->setFocus();
	}

	void submit()
	{
		const QString text = prompt->text().trimmed();
		if (busy || text.isEmpty())
			return;
		ensureRuntime();
		busy = true;
		send->setEnabled(false);
		attach->setEnabled(false);
		prompt->clear();
		append(tr("Tú: %1").arg(text));
		status->setText(tr("Consultando…"));
		if (poster.isEmpty() || text.startsWith('/')) {
			plan(text);
			return;
		}
		QFile file(poster);
		if (!file.open(QIODevice::ReadOnly) || file.size() > 8 * 1024 * 1024) {
			done(tr("No se pudo abrir el cartel o supera los 8 MB."));
			return;
		}
		const auto ext = QFileInfo(poster).suffix().toLower();
		const QByteArray type = ext == "png" ? "image/png" : ext == "webp" ? "image/webp" : "image/jpeg";
		request("/graphic-assets", type, file.readAll(), [this, text](const QJsonObject &data, const QString &error) {
			if (!error.isEmpty()) {
				done(error);
				return;
			}
			poster.clear();
			plan(text + "\nCartel adjunto: " + data.value("url").toString());
		});
	}

	void plan(const QString &text)
	{
		post("/plan", {{"password", password}, {"prompt", text}, {"inspectPreview", "auto"}}, [this](const QJsonObject &data, const QString &error) {
			if (!error.isEmpty()) {
				done(error);
				return;
			}
			append(data.value("message").toString());
			const auto id = data.value("id").toString();
			if (id.isEmpty()) {
				done();
				return;
			}
			QString graphicScene;
			const auto steps = data.value("steps").toArray();
			for (const auto &entry : steps) {
				const auto step = entry.toObject();
				const auto kind = step.value("kind").toString();
				if (kind == "graphic" || kind == "restore-graphic")
					graphicScene = step.value("scene").toString();
			}
			status->setText(tr("Aplicando cambios en OBS…"));
			post("/apply", {{"password", password}, {"id", id}}, [this, graphicScene](const QJsonObject &result, const QString &applyError) {
				if (!applyError.isEmpty()) {
					done(applyError);
					return;
				}
				append(result.value("message").toString());
				if (graphicScene.isEmpty() || result.value("state").toObject().value("preview").toString() != graphicScene) {
					done();
					return;
				}
				status->setText(tr("Comprobando el grafismo en previo…"));
				post("/plan", {{"password",password},{"prompt","Revisa visualmente el grafismo en previo: solapes, recortes y legibilidad."},
					       {"inspectPreview","auto"},{"visualReview",true},{"expectedPreview",graphicScene}},
				     [this](const QJsonObject &review, const QString &reviewError) {
					     if (reviewError.isEmpty())
						     append(tr("Revisión: %1").arg(review.value("message").toString()));
					     done(reviewError);
				     });
			});
		});
	}
};

QPointer<Panel> panel;
QPointer<QAction> connectionAction;
}

bool obs_module_load()
{
	panel = new Panel;
	if (!obs_frontend_add_dock_by_id(dockId, "Live Agent", panel.data())) {
		delete panel.data();
		return false;
	}
	connectionAction = static_cast<QAction *>(obs_frontend_add_tools_menu_qaction("Live Agent: conexión"));
	if (connectionAction)
		QObject::connect(connectionAction, &QAction::triggered, panel.data(), [] { if (panel) panel->showSettings(); });
	return true;
}

void obs_module_unload()
{
	delete connectionAction.data();
	obs_frontend_remove_dock(dockId);
	if (panel)
		delete panel.data();
}
