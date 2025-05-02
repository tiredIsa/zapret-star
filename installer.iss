[Setup]
AppId=zapret-star
AppName=zapret-star
AppVersion=0.4.1
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
; Запускает zapret-star.exe из папки установки ({app})
; Description: Текст, который увидит пользователь рядом с галочкой на последней странице
; WorkingDir: Устанавливает рабочую директорию, чтобы программа нашла свои файлы
; Flags:
;   postinstall - Показать опцию на последней странице мастера (включена по умолчанию)
;   nowait - Не ждать завершения zapret-star.exe, чтобы мастер установки мог закрыться
;   shellexec - Использовать ShellExecute для запуска (часто более надежно для GUI приложений)
Filename: "{app}\zapret-star.exe"; Description: "Запустить Zapret-Star после установки"; WorkingDir: "{app}"; Flags: nowait shellexec postinstall


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

