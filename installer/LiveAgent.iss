#ifndef AppVersion
  #define AppVersion "0.3.1"
#endif

[Setup]
AppId=MarcSoul.LiveAgent
AppName=Live Agent
AppVersion={#AppVersion}
AppPublisher=MarcSoul
DefaultDirName={localappdata}\Programs\Live Agent
DefaultGroupName=Live Agent
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=Live-Agent-{#AppVersion}-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
InfoAfterFile=after-install.txt
UninstallDisplayName=Live Agent

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Live Agent"; Filename: "{app}\start-windows.cmd"; WorkingDir: "{app}"
Name: "{group}\Arranque y configuración"; Filename: "{app}\README.md"
Name: "{userstartup}\Live Agent"; Filename: "{app}\start-windows.cmd"; WorkingDir: "{app}"; Tasks: startup

[Tasks]
Name: "startup"; Description: "Iniciar Live Agent al iniciar sesión en Windows"; Flags: unchecked

[Run]
Filename: "{app}\start-windows.cmd"; Description: "Iniciar Live Agent"; Flags: postinstall nowait skipifsilent
