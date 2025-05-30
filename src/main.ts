import { dirname, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const executablePath = Deno.execPath();
const executableDir = dirname(executablePath);
const binPath = join(executableDir, "/bin");
const winwsPath = join(executableDir, "/bin/winws.exe");
const listsPath = join(executableDir, "/lists");
import config from "./config/config.json" with { type: "json" };
import { clear, promptMenu, waitUserInput, write } from "./menu.ts";
import { checkForUpdates, downloadInstaller, runInstaller } from "./update.ts";

interface IUserConfig {
  lastStrategy: {
    name: string;
    value: number;
  };
  startAfterUpdate: boolean;
  restartCount: number;
}
let userConfig: IUserConfig | null = null;

const DEFAULT_USER_CONFIG: IUserConfig = {
  lastStrategy: { name: "default", value: 0 },
  startAfterUpdate: false,
  restartCount: 0,
} as const;

const MENU_BUTTONS = {
  start: {
    name: "Запустить",
    value: "start",
  },
  reload: {
    name: "Перезапустить",
    value: "restart",
  },
  stop: {
    name: "Остановить",
    value: "stop",
  },
  stopDev: {
    name: "Остановить [DEV]",
    value: "stop",
  },
  status: {
    name: "Статус [DEV]",
    value: "status",
  },
  resetUserSettings: {
    name: "Сбросить настройки пользователя [DEV]",
    value: "resetUserSettings",
  },
  hasUpdate: {
    name: "Доступно обновление!",
    value: "update",
  },
  empty: {},
} as const;

const processNames = {
  zapret: "zapret",
  winDivert: "WinDivert",
  winws: "winws.exe",
} as const;

function isValidUserConfig(obj: any): obj is IUserConfig {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  if (typeof obj.startAfterUpdate !== "boolean") {
    console.warn("Поле 'startAfterUpdate' отсутствует или имеет неверный тип.");
    return false; // Или можно присвоить значение по умолчанию здесь
  }
  if (!obj.lastStrategy || typeof obj.lastStrategy !== "object") {
    console.warn("Поле 'lastStrategy' отсутствует или имеет неверный тип.");
    return false;
  }
  if (typeof obj.lastStrategy.name !== "string") {
    console.warn(
      "Поле 'lastStrategy.name' отсутствует или имеет неверный тип.",
    );
    return false;
  }
  if (typeof obj.lastStrategy.value !== "number") {
    console.warn(
      "Поле 'lastStrategy.value' отсутствует или имеет неверный тип.",
    );
    return false;
  }
  return true;
}

const loadUserConfig = async () => {
  const configPath = join(dirname(Deno.execPath()), "user-settings.json");

  try {
    console.log("Пытаюсь загрузить файл из:", configPath);
    const loadedConfig = await Deno.readTextFile(configPath);
    if (isValidUserConfig(loadedConfig)) {
      userConfig = loadedConfig;
      console.log("Конфиг валиден и загружен:", userConfig);
    } else {
      console.warn(
        "Обнаружена невалидная структура конфига. Используются настройки по умолчанию.",
      );
      userConfig = { ...DEFAULT_USER_CONFIG };
      await Deno.writeTextFile(
        configPath,
        JSON.stringify(DEFAULT_USER_CONFIG, null, 2),
      );
    }
  } catch (err) {
    console.log(err);
    if (err instanceof Deno.errors.NotFound) {
      console.log("Создаю новый файл конфигурации в:", configPath);
      await Deno.writeTextFile(
        configPath,
        JSON.stringify(DEFAULT_USER_CONFIG, null, 2),
      );
      userConfig = JSON.parse(
        await Deno.readTextFile(configPath),
      ) as IUserConfig;
    } else {
      console.error("Ошибка при чтении user-settings.json:", err);
    }
  }
};

const writeToUserConfig = async <K extends keyof IUserConfig>(
  key: K,
  value: IUserConfig[K],
): Promise<boolean> => {
  if (!userConfig) {
    console.error("Пользовательские настройки не загружены.");
    return false;
  }

  userConfig[key] = value;

  try {
    await Deno.writeTextFile(
      "user-settings.json",
      JSON.stringify(userConfig, null, 2),
    );
    return true;
  } catch (err) {
    console.error("Ошибка при записи в user-settings.json:", err);
    return false;
  }
};

async function checkAdminRights(): Promise<boolean> {
  if (Deno.build.os !== "windows") return true;

  const isAdmin = await new Deno.Command("net", {
    args: ["session"],
    stdout: "null",
    stderr: "null",
  }).output()
    .then(({ success }) => success)
    .catch(() => false);

  console.log("isAdmin", isAdmin);
  return isAdmin;
}

async function restartAsAdmin(): Promise<boolean> {
  if (Deno.build.os !== "windows") return true;

  try {
    const exePath = Deno.execPath();
    console.log("Требуются права администратора. Перезапуск...");

    const escapeForPowerShell = (str: string): string => {
      return `'${str.replace(/'/g, "''")}'`;
    };

    const escapedExePath = escapeForPowerShell(exePath);

    const { success } = await new Deno.Command("where", {
      args: ["wt.exe"],
      stdout: "null",
      stderr: "null",
    }).output();

    if (success) {
      const psCommand = `Start-Process -FilePath "wt.exe" -ArgumentList @('${
        exePath.replace(/'/g, "''")
      }') -Verb RunAs`;
      const result = await new Deno.Command("powershell.exe", {
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
      }).output();
      return result.success;
    }

    const result = await new Deno.Command("powershell", {
      args: [
        "-NoProfile",
        "-Command",
        `Start-Process -FilePath ${escapedExePath} -Verb RunAs`,
      ],
    }).output();
    
    return result.success;
  } catch (error) {
    console.error("Ошибка при перезапуске с правами администратора:", error);
    return false;
  }
}

const executeCommand = async (
  command: string,
  args: string[] = [],
  context?: string,
): Promise<{ code: number; stdout: string; stderr: string } | null> => {
  const fullCommandString = `${command} ${args.join(" ")}`;

  console.log(
    `[Command Executor] Attempting to execute command: '${fullCommandString}'` +
      (context ? ` (Context: ${context})` : ""),
  );

  try {
    const processCommand = new Deno.Command(command, {
      args: args,
      stdout: "piped",
      stderr: "piped",
    });

    const output = await processCommand.output();

    const decoder = new TextDecoder();
    const stdout = decoder.decode(output.stdout).trim();
    const stderr = decoder.decode(output.stderr).trim();

    console.log(
      `[Command Executor] Command '${fullCommandString}' finished with code: ${output.code}`,
    );

    if (stdout) {
      console.log(
        `[Command Executor] Stdout:\n--- STDOUT START ---\n${stdout}\n--- STDOUT END ---`,
      );
    }

    if (stderr) {
      console.log(
        `[Command Executor] Stderr:\n--- STDERR START ---\n${stderr}\n--- STDERR END ---`,
      );
    }

    return { code: output.code, stdout, stderr };
  } catch (error) {
    console.error(
      `[Command Executor] Critical error executing command '${fullCommandString}':`,
      error instanceof Error ? error.message : error,
      error instanceof Error ? `\n${error.stack}` : "",
    );
    return null;
  }
};

const processArgs = (strategy_index: number = 0): string[] => {
  const strategy = config.strategys[strategy_index];
  const args = strategy.arguments.map((arg) => {
    arg = arg.replace("{{LIST_PATH}}", `${listsPath}\\`);
    arg = arg.replace("{{BIN_PATH}}", `${binPath}\\`);
    return arg;
  });

  console.log(args);

  return args;
};

const startZapretAsService = async (args: string[]) => {
  const createResult = await executeCommand(
    "sc.exe",
    [
      "create",
      processNames.zapret,
      "binPath=",
      `${winwsPath} ${args.join(" ")}`,
      "start=",
      "auto",
    ],
    `создания службы ${processNames.zapret}`,
  );
  if (!createResult || createResult.code !== 0) {
    console.error(
      `Не удалось создать службу "${processNames.zapret}": ` +
        `${createResult?.stderr || createResult?.stdout}`,
    );
    return;
  }
  console.log(
    `Служба "${processNames.zapret}" создана и настроена на автозапуск.`,
  );

  const startResult = await executeCommand(
    "sc.exe",
    ["start", processNames.zapret],
    `запуска службы ${processNames.zapret}`,
  );
  if (!startResult || startResult.code !== 0) {
    console.error(
      `Не удалось запустить службу "${processNames.zapret}": ` +
        `${startResult?.stderr || startResult?.stdout}`,
    );
    return;
  }
  console.log(`Служба "${processNames.zapret}" успешно запущена.`);
};

const stopProcess = async (pid: number) => {
  if (!pid) {
    console.error("Ошибка: PID не может быть пустым.");
    return;
  }

  console.log("trt close", pid);

  try {
    const command = new Deno.Command("taskkill", {
      args: ["/PID", pid.toString(), "/F"],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await command.output();
    const decoder = new TextDecoder();

    const stderr = decoder.decode(output.stderr).trim();

    if (output.code !== 0) {
      console.error(
        `Ошибка при завершении процесса с PID ${pid}: ${stderr}`,
      );
      return;
    }

    write(`Процесс с PID ${pid} успешно завершен.`);
  } catch (error) {
    console.error(
      `Ошибка при завершении процесса с PID ${pid}:`,
      error,
    );
  }
};

const stopServiceAndDelete = async (serviceName: string): Promise<void> => {
  serviceName = serviceName.trim();
  console.log(`Останавливаю и удаляю службу "${serviceName}"...`);

  const stopResult = await executeCommand(
    "sc.exe",
    ["stop", serviceName],
    `остановки службы ${serviceName}`,
  );

  if (stopResult === null) {
    console.error(
      `Ошибка: не удалось отправить команду остановки для службы "${serviceName}"`,
    );
    return;
  }

  if (
    stopResult.code !== 0 && stopResult.code !== 1062 &&
    stopResult.code !== 1060
  ) {
    const errorMessage = stopResult.stderr || stopResult.stdout ||
      "неизвестная ошибка";
    console.error(
      `Не удалось остановить службу "${serviceName}": ${errorMessage}`,
    );
    return;
  }

  console.log(
    `Служба "${serviceName}" успешно остановлена или уже была неактивна`,
  );

  const deleteResult = await executeCommand(
    "sc.exe",
    ["delete", serviceName],
    `удаления службы ${serviceName}`,
  );

  if (deleteResult === null) {
    console.error(
      `Ошибка: не удалось отправить команду удаления для службы "${serviceName}"`,
    );
    return;
  }

  if (deleteResult.code === 0) {
    console.log(`Служба "${serviceName}" успешно удалена`);
  } else if (deleteResult.code === 1072) {
    console.log(
      `Служба "${serviceName}" уже помечена для удаления и будет удалена после перезагрузки`,
    );
  } else if (deleteResult.code === 1060) {
    console.log(`Служба "${serviceName}" не найдена (возможно уже удалена)`);
  } else {
    const errorMessage = deleteResult.stderr || deleteResult.stdout ||
      "неизвестная ошибка";
    console.error(
      `Не удалось удалить службу "${serviceName}": ${errorMessage}`,
    );
  }
};

const findProcess = async (process_name: string) => {
  if (!process_name || process_name.trim() === "") {
    console.error("Ошибка: Имя процесса не может быть пустым.");
    return null;
  }
  process_name = process_name.trim();

  try {
    const command = new Deno.Command("wmic", {
      args: [
        "process",
        "where",
        `Name='${process_name}'`,
        "get",
        "ProcessId",
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await command.output();
    const decoder = new TextDecoder();

    const stdout = decoder.decode(output.stdout);
    const stderr = decoder.decode(output.stderr).trim();

    if (
      stdout.includes("No Instance(s) Available.") ||
      stderr.includes("No Instance(s) Available.")
    ) {
      return null;
    }

    if (output.code !== 0) {
      console.error(
        `Команда wmic завершилась с кодом ${output.code}. Stderr: ${stderr}`,
      );
      return null;
    }

    const lines = stdout.split(/\r?\n/);
    let headerFound = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === "") {
        continue;
      }

      if (!headerFound) {
        if (trimmedLine.toLowerCase() === "processid") {
          headerFound = true;
        }
        continue;
      }

      if (/^\d+$/.test(trimmedLine)) {
        const pid = parseInt(trimmedLine, 10);
        if (!isNaN(pid)) {
          return pid;
        }
      }
    }
    return null;
  } catch (error) {
    console.error(
      `Ошибка при выполнении wmic для поиска процесса '${process_name}':`,
      error,
    );
    return null;
  }
};

async function serviceStatus(
  serviceName: string,
): Promise<{ exist: boolean; running: boolean }> {
  const defaultResult = { exist: false, running: false };

  serviceName = serviceName.trim();
  if (!serviceName) {
    console.error("Ошибка: Имя службы не может быть пустым.");
    return defaultResult;
  }

  try {
    const statusResult = await executeCommand(
      "sc.exe",
      ["query", serviceName],
      `запроса состояния службы ${serviceName}`,
    );

    if (statusResult === null) {
      console.error(
        `[Service Control] Не удалось выполнить команду sc для службы '${serviceName}'.`,
      );
      return defaultResult;
    }

    if (statusResult?.code === 0) {
      let isRunning = false;
      const lines = statusResult.stdout.split("\n");
      let stateFound = false;

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("STATE")) {
          stateFound = true;
          if (trimmedLine.includes("RUNNING")) {
            isRunning = true;
          }
          break;
        }
      }

      if (!stateFound) {
        console.warn(
          `Warning: Could not determine state for service "${serviceName}" from sc query output, although command succeeded (exit code 0). Assuming not running.`,
        );
        return { exist: true, running: false };
      }

      return { exist: true, running: isRunning };
    } else if (statusResult?.code === 1060) {
      return defaultResult;
    } else {
      const combinedOutput = statusResult.stdout + statusResult.stderr;
      console.error(
        `Error querying service "${serviceName}" (Exit Code: ${statusResult?.code}):\n${combinedOutput}`,
      );
      return defaultResult;
    }
  } catch (error) {
    console.error(
      `Failed to execute sc.exe for service "${serviceName}":`,
      error,
    );
    return defaultResult;
  }
}

async function editFileInteractive(filePath: string): Promise<boolean> {
  const editor = Deno.env.get("EDITOR") || "notepad.exe";
  write(`\nОткрываю ${filePath} в ${editor}...`);

  let process: Deno.ChildProcess | null = null;

  try {
    const cmd = new Deno.Command(editor, {
      args: [filePath],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    });
    process = cmd.spawn();

    write("Ожидание закрытия редактора...");

    const status = await process.status;

    if (status.success) {
      write("\nРедактор успешно закрыт.");
      return true;
    } else {
      console.warn(`\nРедактор закрыт с кодом ошибки: ${status.code}.`);
      return true;
    }
  } catch (error: unknown) {
    console.error(`\nОшибка запуска редактора '${editor}':`, error);

    if (error instanceof Error) {
      if (
        error instanceof Deno.errors.NotFound ||
        error.message.includes("os error 2")
      ) {
        console.error(`Убедитесь, что редактор доступен в PATH.`);
      }
    } else {
      console.error(`Неизвестная ошибка: ${error}`);
    }

    if (process?.pid) {
      try {
        process.kill("SIGKILL");
      } catch (killError: unknown) {
        if (killError instanceof Error) {
          if (
            !killError.message.includes("process has exited") &&
            !killError.message.includes("No such process")
          ) {
            console.error(
              `    Не удалось завершить процесс после ошибки: ${killError.message}`,
            );
          }
        } else {
          console.error(
            `    Не удалось завершить процесс после неизвестной ошибки: ${killError}`,
          );
        }
      }
    }
    return false;
  }
}

async function findAllZapretProcesses() {
  const pin = await findProcess(processNames.winws);
  const zapret_status = await serviceStatus(processNames.zapret);
  const winDivert_status = await serviceStatus(processNames.winDivert);

  return {
    pin,
    isZapretRunning: pin ? true : false,
    zapret_status,
    winDivert_status,
  };
}

async function getProcessParentName(): Promise<string> {
  if (Deno.build.os !== "windows") return "unknown";

  try {
    const command = new Deno.Command("wmic", {
      args: [
        "process",
        "where",
        `ProcessId=${Deno.pid}`,
        "get",
        "ParentProcessId",
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await command.output();
    const decoder = new TextDecoder();
    const stdout = decoder.decode(output.stdout).trim();
    
    // Extract the parent PID from the output
    const parentPid = stdout.split("\n")[1]?.trim();
    if (!parentPid) return "unknown";

    // Get the parent process name
    const parentCommand = new Deno.Command("wmic", {
      args: [
        "process",
        "where",
        `ProcessId=${parentPid}`,
        "get",
        "Name",
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const parentOutput = await parentCommand.output();
    const parentStdout = decoder.decode(parentOutput.stdout).trim();
    const parentName = parentStdout.split("\n")[1]?.trim() || "unknown";

    // Map common terminal names to more readable formats
    const terminalNames: Record<string, string> = {
      "cmd.exe": "Command Prompt",
      "powershell.exe": "PowerShell",
      "wt.exe": "Windows Terminal",
      "conhost.exe": "Console Host",
      "explorer.exe": "Windows Explorer",
    };

    return terminalNames[parentName] || parentName;
  } catch (error) {
    console.error("Error getting process parent name:", error);
    return "unknown";
  }
}

const main = async () => {
  if (Deno.build.os !== "windows") {
    console.error("Эта программа предназначена только для Windows.");
    return false;
  }
  
  // TODO починить т.к сейчас это пиздец
  // мб в темп файле если будет доступ без админ прав
  if (!await checkAdminRights()) {
    console.log("Запуск без прав администратора, перезапускаю...");
    await restartAsAdmin();
  }
    
  await loadUserConfig();

  const hasUpdate = await checkForUpdates();

  let isRunning = true;

  while (isRunning) {
    const { pin, zapret_status, winDivert_status, isZapretRunning } =
      await findAllZapretProcesses();

    type Action =
      | "start"
      | "startAfterUpdate"
      | "restart"
      | "stop"
      | "status"
      | "update"
      | "exit";

    const handlers: Record<Action, () => Promise<void>> = {
      start: async () => {
        await handlers.stop(); // на всякий

        //  выбор стратегии
        const strategyIndex = await promptMenu(
          [
            userConfig?.lastStrategy
              ? {
                name:
                  `~. ${userConfig?.lastStrategy.name} (последняя активная)`,
                value: userConfig.lastStrategy.value.toString(),
              }
              : {},
            ...config.strategys.map((strategy, index) => ({
              name: `${index}. ${strategy.name}`,
              value: index + "",
            })),
            { name: "Отмена", value: "exit" },
          ],
          "Выберите стратегию:",
        );

        console.log("выбранная стратегия: ", strategyIndex);

        if (
          strategyIndex && !/^[0-9]+$/.test(strategyIndex) ||
          strategyIndex === "exit"
        ) {
          write("\nВыход.");
          return;
        }

        await writeToUserConfig("lastStrategy", {
          name: config.strategys[Number(strategyIndex)].name,
          value: Number(strategyIndex),
        });

        write("\nЗапуск Zapret...");
        await startZapretAsService(processArgs(Number(strategyIndex)));
      },
      startAfterUpdate: async () => {
        await handlers.stop(); // на всякий

        const strategyIndex = userConfig?.lastStrategy.value.toString();

        if (
          strategyIndex && !/^[0-9]+$/.test(strategyIndex) ||
          strategyIndex === "exit"
        ) {
          write("\nВыход.");
          return;
        }

        if (!strategyIndex) {
          write("\nОшибка: Не найдена последняя стратегия.");
          return;
        }

        write("\nЗапуск Zapret...");
        await startZapretAsService(processArgs(Number(strategyIndex)));
      },
      stop: async () => {
        write("\nОстановка winws...");
        await stopProcess(pin!);

        write("\Удаление службы zapret...");
        await stopServiceAndDelete(processNames.zapret);

        write("\nУдаление службы WinDivert...");
        await stopServiceAndDelete(processNames.winDivert);
      },
      restart: async () => {
        await handlers.stop();
        await handlers.start();
      },
      status: async () => {
        write("\nСтатус службы WinDivert:\n");
        await serviceStatus(processNames.winDivert);

        write("\n==================================================\n");

        write("\nСтатус службы zapret:\n");
        await serviceStatus(processNames.zapret);
      },
      update: async () => {
        clear()
        write("\n=== Инструкция по обновлению ===\n");
        write("1. Дождаться автоматического скачивания установщика новой версии.\n");
        write("2. В открытом установщике следуйте инструкциям.\n");
        write("3. После успешной установки, вам необходимо запустить `zapret-star` через терминал.\n");
        write("4. При первом открытии после обновления программа сама запустит последнюю активную стратегию.\n");
        write("Приношу свои извинения за неудобства и спасибо за понимание!\n");
        write("\nНажмите 'Y' для продолжения обновления или 'N' для отмены...\n");
        
        let input = await waitUserInput();
        while (input.toLowerCase() !== 'y' && input.toLowerCase() !== 'n') {
          write("\nНеверный ввод. Пожалуйста введите 'Y' или 'N'.\n");
          input = await waitUserInput();
        }
        if (input.toLowerCase() !== 'y') {
          write("\nОбновление отменено.\n");
          return;
        }

        await writeToUserConfig("startAfterUpdate", true);
        write("\nОстановка Zapret...");
        await handlers.stop();

        write("\nСкачивание новой версии...");
        write("\nПожалуйста подождите...");
        const installerPath = await downloadInstaller();

        console.log(installerPath);

        write("\nЗапуск установщика");
        runInstaller(installerPath);

        write("\nЗакрытие текущего процесса...");
        new Deno.Command("taskkill", {
          args: ["/PID", Deno.pid.toString(), "/F"],
        }).spawn();
      },
      exit: async () => {
        isRunning = false;
        write("\nВыход.");
      },
    };

    if (userConfig?.lastStrategy && userConfig?.startAfterUpdate === true) {
      try {
        await handlers.startAfterUpdate();
      } catch (e) {
        console.error("Ошибка при запуске после обновления:", e);
      }
      await writeToUserConfig("startAfterUpdate", false);
    }

    const action = await promptMenu(
      [
        isZapretRunning ? MENU_BUTTONS.reload : MENU_BUTTONS.start,
        isZapretRunning ? MENU_BUTTONS.stop : MENU_BUTTONS.empty,
        MENU_BUTTONS.status,
        //MENU_BUTTONS.resetUserSettings,
        hasUpdate ? MENU_BUTTONS.hasUpdate : MENU_BUTTONS.empty,
        { name: "Выйти", value: "exit" },
      ],
      "Выберите действие:",
      {
        zapret: {
          autostart: zapret_status.exist,
          status: pin ? true : false,
        },
        winDivert: {
          autostart: winDivert_status.exist,
          status: winDivert_status.running,
        },
      },
    );

   clear();
    await handlers[action as Action]();

    if (action !== "exit") {
      await waitUserInput();
    }
  }
};

main();
