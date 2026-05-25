; UMS — UPS Management System
; Inno Setup 6 installer script
; Compile with: iscc setup.iss

#define MyAppName      "UPS Management System"
#define MyAppVersion   "2.1.0"
#define MyAppPublisher "Hadi Engineering"
#define MyAppURL       "http://ums.local:3303"
#define MyAppExeName   "ums-service.exe"
#define NodeVersion    "24.15.0"
#define NodeMsi        "node-v24.15.0-x64.msi"
#define PgVersion      "16"
#define NssmExe        "nssm.exe"

[Setup]
AppId={{9A2F4C1D-8B3E-4F7A-A2D1-5C8E9B3F0D2A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\UMS
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=dist
OutputBaseFilename=UMS-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0

; Custom wizard pages use code section below
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.WelcomeLabel2=This will install {#MyAppName} {#MyAppVersion} on your computer.%n%nThis includes an embedded MQTT broker, web dashboard, and database tools.%n%nClick Next to continue.

[Types]
Name: "full"; Description: "Full installation"

[Components]
Name: "main"; Description: "UMS Application"; Types: full; Flags: fixed

[Dirs]
Name: "{app}"
Name: "{app}\app"
Name: "{app}\scripts"
Name: "{app}\logs"
Name: "{app}\tools"

[Files]
; Application bundle (built by: npm run build then scripts/package.js)
Source: "..\dist\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs createallsubdirs

; PowerShell scripts
Source: "scripts\post-install.ps1"; DestDir: "{app}\scripts"
Source: "scripts\uninstall.ps1";    DestDir: "{app}\scripts"
Source: "scripts\setup-db.ps1";     DestDir: "{app}\scripts"

; NSSM service manager
Source: "tools\nssm.exe"; DestDir: "{app}\tools"

; Node.js MSI (bundled — will be silently installed if Node not found)
Source: "tools\{#NodeMsi}"; DestDir: "{app}\tools"; Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName} Dashboard"; Filename: "{app}\scripts\open-dashboard.bat"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Code]

var
  DbHostPage:     TWizardPage;
  DbHostEdit:     TEdit;
  DbPortEdit:     TEdit;
  DbNameEdit:     TEdit;
  DbUserEdit:     TEdit;
  DbPassEdit:     TEdit;

  AdminPassPage:  TWizardPage;
  AdminPassEdit:  TEdit;
  AdminPass2Edit: TEdit;

  PortsPage:      TWizardPage;
  MqttPortEdit:   TEdit;
  HttpPortEdit:   TEdit;

  LicensePage:    TWizardPage;
  LicenseKeyMemo: TMemo;

{ ---- Wizard page creation ---- }

procedure InitializeWizard;
var
  Lbl: TLabel;

begin
  { Page 1 — PostgreSQL connection }
  DbHostPage := CreateCustomPage(wpSelectDir, 'Database Connection',
    'Enter your PostgreSQL server details.');

  Lbl := TLabel.Create(DbHostPage);
  Lbl.Parent  := DbHostPage.Surface;
  Lbl.Caption := 'Host:';
  Lbl.Left := 0; Lbl.Top := 8;

  DbHostEdit := TEdit.Create(DbHostPage);
  DbHostEdit.Parent := DbHostPage.Surface;
  DbHostEdit.Left := 120; DbHostEdit.Top := 4;
  DbHostEdit.Width := 240; DbHostEdit.Text := 'localhost';

  Lbl := TLabel.Create(DbHostPage);
  Lbl.Parent  := DbHostPage.Surface;
  Lbl.Caption := 'Port:';
  Lbl.Left := 0; Lbl.Top := 38;

  DbPortEdit := TEdit.Create(DbHostPage);
  DbPortEdit.Parent := DbHostPage.Surface;
  DbPortEdit.Left := 120; DbPortEdit.Top := 34;
  DbPortEdit.Width := 80; DbPortEdit.Text := '5432';

  Lbl := TLabel.Create(DbHostPage);
  Lbl.Parent  := DbHostPage.Surface;
  Lbl.Caption := 'Database name:';
  Lbl.Left := 0; Lbl.Top := 68;

  DbNameEdit := TEdit.Create(DbHostPage);
  DbNameEdit.Parent := DbHostPage.Surface;
  DbNameEdit.Left := 120; DbNameEdit.Top := 64;
  DbNameEdit.Width := 240; DbNameEdit.Text := 'ums_local';

  Lbl := TLabel.Create(DbHostPage);
  Lbl.Parent  := DbHostPage.Surface;
  Lbl.Caption := 'DB Username:';
  Lbl.Left := 0; Lbl.Top := 98;

  DbUserEdit := TEdit.Create(DbHostPage);
  DbUserEdit.Parent := DbHostPage.Surface;
  DbUserEdit.Left := 120; DbUserEdit.Top := 94;
  DbUserEdit.Width := 240; DbUserEdit.Text := 'ums_user';

  Lbl := TLabel.Create(DbHostPage);
  Lbl.Parent  := DbHostPage.Surface;
  Lbl.Caption := 'DB Password:';
  Lbl.Left := 0; Lbl.Top := 128;

  DbPassEdit := TEdit.Create(DbHostPage);
  DbPassEdit.Parent := DbHostPage.Surface;
  DbPassEdit.Left := 120; DbPassEdit.Top := 124;
  DbPassEdit.Width := 240; DbPassEdit.PasswordChar := '*';

  { Page 2 — Admin password }
  AdminPassPage := CreateCustomPage(DbHostPage.ID, 'Admin Password',
    'Set the password for the Admin and Manufacturer roles.');

  Lbl := TLabel.Create(AdminPassPage);
  Lbl.Parent  := AdminPassPage.Surface;
  Lbl.Caption := 'Password:';
  Lbl.Left := 0; Lbl.Top := 8;

  AdminPassEdit := TEdit.Create(AdminPassPage);
  AdminPassEdit.Parent := AdminPassPage.Surface;
  AdminPassEdit.Left := 140; AdminPassEdit.Top := 4;
  AdminPassEdit.Width := 240; AdminPassEdit.PasswordChar := '*';

  Lbl := TLabel.Create(AdminPassPage);
  Lbl.Parent  := AdminPassPage.Surface;
  Lbl.Caption := 'Confirm password:';
  Lbl.Left := 0; Lbl.Top := 38;

  AdminPass2Edit := TEdit.Create(AdminPassPage);
  AdminPass2Edit.Parent := AdminPassPage.Surface;
  AdminPass2Edit.Left := 140; AdminPass2Edit.Top := 34;
  AdminPass2Edit.Width := 240; AdminPass2Edit.PasswordChar := '*';

  { Page 3 — License public key }
  LicensePage := CreateCustomPage(AdminPassPage.ID, 'License Public Key',
    'Paste the Automatrix Ed25519 public key for offline license verification.');

  Lbl := TLabel.Create(LicensePage);
  Lbl.Parent  := LicensePage.Surface;
  Lbl.Caption := 'UMS_LICENSE_PUBLIC_KEY_PEM:';
  Lbl.Left := 0; Lbl.Top := 8;

  LicenseKeyMemo := TMemo.Create(LicensePage);
  LicenseKeyMemo.Parent := LicensePage.Surface;
  LicenseKeyMemo.Left := 0; LicenseKeyMemo.Top := 30;
  LicenseKeyMemo.Width := 410; LicenseKeyMemo.Height := 110;
  LicenseKeyMemo.ScrollBars := ssVertical;

  { Page 4 — Ports }
  PortsPage := CreateCustomPage(LicensePage.ID, 'Ports',
    'Configure the network ports used by UMS.');

  Lbl := TLabel.Create(PortsPage);
  Lbl.Parent  := PortsPage.Surface;
  Lbl.Caption := 'MQTT broker port:';
  Lbl.Left := 0; Lbl.Top := 8;

  MqttPortEdit := TEdit.Create(PortsPage);
  MqttPortEdit.Parent := PortsPage.Surface;
  MqttPortEdit.Left := 160; MqttPortEdit.Top := 4;
  MqttPortEdit.Width := 80; MqttPortEdit.Text := '1883';

  Lbl := TLabel.Create(PortsPage);
  Lbl.Parent  := PortsPage.Surface;
  Lbl.Caption := 'Dashboard port:';
  Lbl.Left := 0; Lbl.Top := 38;

  HttpPortEdit := TEdit.Create(PortsPage);
  HttpPortEdit.Parent := PortsPage.Surface;
  HttpPortEdit.Left := 160; HttpPortEdit.Top := 34;
  HttpPortEdit.Width := 80; HttpPortEdit.Text := '3303';
end;

{ ---- Validation ---- }

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = AdminPassPage.ID then
  begin
    if AdminPassEdit.Text = '' then
    begin
      MsgBox('Please enter an admin password.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if AdminPassEdit.Text <> AdminPass2Edit.Text then
    begin
      MsgBox('Passwords do not match.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Length(AdminPassEdit.Text) < 8 then
    begin
      MsgBox('Password must be at least 8 characters.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  if CurPageID = DbHostPage.ID then
  begin
    if DbPassEdit.Text = '' then
    begin
      MsgBox('Please enter the database password.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  if CurPageID = LicensePage.ID then
  begin
    if Pos('BEGIN PUBLIC KEY', LicenseKeyMemo.Text) = 0 then
    begin
      MsgBox('Paste the Automatrix Ed25519 public key PEM before continuing.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

{ ---- Post-install: call PowerShell setup script ---- }

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Cmd, Args: String;
begin
  if CurStep = ssPostInstall then
  begin
    Cmd  := 'powershell.exe';
    Args := Format(
      '-NonInteractive -ExecutionPolicy Bypass -File "%s\scripts\post-install.ps1"' +
      ' -InstallDir "%s"' +
      ' -DbHost "%s" -DbPort "%s" -DbName "%s" -DbUser "%s" -DbPass "%s"' +
      ' -AdminPass "%s"' +
      ' -LicensePublicKeyPem "%s"' +
      ' -MqttPort "%s" -HttpPort "%s"',
      [ExpandConstant('{app}'), ExpandConstant('{app}'),
       DbHostEdit.Text, DbPortEdit.Text, DbNameEdit.Text,
       DbUserEdit.Text, DbPassEdit.Text,
       AdminPassEdit.Text,
       LicenseKeyMemo.Text,
       MqttPortEdit.Text, HttpPortEdit.Text]);

    if not Exec(Cmd, Args, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      MsgBox('Post-install script failed to start. Check Event Viewer.', mbError, MB_OK)
    else if ResultCode <> 0 then
      MsgBox(Format('Post-install script exited with code %d. Check %s\logs\install.log', [ResultCode, ExpandConstant('{app}')]), mbError, MB_OK);
  end;
end;

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NonInteractive -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall.ps1"" -InstallDir ""{app}"""; RunOnceId: "UMSUninstall"; Flags: runhidden
