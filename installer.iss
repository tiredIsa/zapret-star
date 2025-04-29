[Setup]
AppId=zapret-star
AppName=zapret-star
AppVersion=0.4
DefaultDirName={commonpf}\zapret-star
DefaultGroupName=Zapret-Star
OutputBaseFilename=Zapret-star-Installer
Compression=lzma
SolidCompression=yes

[Files]
Source: "zapret-star.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "lists\*"; DestDir: "{app}\lists"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "user-settings.json"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist

[Registry]
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; \
Check: NeedsAddPath('{app}')

[Run]
Filename: "{app}\zapret-star"; Description: "Запустить Zapret-Star"; Flags: nowait postinstall

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath)
  then
    Result := True
  else
    Result := Pos(';' + UpperCase(Param) + ';', ';' + UpperCase(OrigPath) + ';') = 0;
end;

