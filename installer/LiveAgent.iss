#ifndef AppVersion
  #define AppVersion "0.5.0"
#endif

[Setup]
AppId=MarcSoul.LiveAgent
AppName=Live Agent
AppVersion={#AppVersion}
AppPublisher=MarcSoul
DefaultDirName={autopf}\Live Agent
DefaultGroupName=Live Agent
DisableProgramGroupPage=yes
PrivilegesRequired=admin
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

Source: "live-agent.dll"; DestDir: "{commonappdata}\obs-studio\plugins\live-agent\bin\64bit"; Flags: ignoreversion
Source: "..\native\en-US.ini"; DestDir: "{commonappdata}\obs-studio\plugins\live-agent\data\locale"; Flags: ignoreversion

[Registry]
Root: HKLM; Subkey: "Software\MarcSoul\LiveAgent"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"; Flags: uninsdeletekey

[Icons]
Name: "{group}\Live Agent"; Filename: "{app}\start-windows.cmd"; WorkingDir: "{app}"
Name: "{group}\Arranque y configuración"; Filename: "{app}\README.md"

