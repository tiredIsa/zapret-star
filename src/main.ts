import { dirname, join } from "https://deno.land/std@0.218.2/path/mod.ts";

const executablePath = Deno.execPath();
const executableDir = dirname(executablePath);
const binPath = join(executableDir, "/bin");
const winwsPath = join(executableDir, "/bin/winws.exe");
const listsPath = join(executableDir, "/lists");
import config from "./config/config.json" with { type: "json" };
import { clear, promptMenu, waitUserInput, write } from "./menu.ts";

let isOldCmd = false;

const processNames = {
  zapret: "zapret",
  winDivert: "WinDivert",
  winws: "winws.exe",
} as const;

interface Config {
  version: string;
  strategys: DPIStrategy[];
}

interface DPIStrategy {
  name: string;
  arguments: string[];
}

async function ensureAdminOrRelaunch(): Promise<void> {
  if (Deno.build.os !== "windows") return;

  //const curentConsolePID = Deno.pid;

  const isAdmin = await new Deno.Command("net", {
    args: ["session"],
    stdout: "null",
    stderr: "null",
  }).output()
    .then(({ success }) => success)
    .catch(() => false);

  if (isAdmin) return;

  console.log("Требуются права администратора. Перезапуск...");

  const exePath = Deno.execPath();
  const scriptPath = Deno.mainModule;
  const args = Deno.args.map((arg) => arg.includes(" ") ? `"${arg}"` : arg);

  const isExe = exePath.endsWith(".exe") && !exePath.includes("deno.exe");
  const relaunchArgs = isExe
    ? [scriptPath, ...args]
    : ["run", "--allow-run", scriptPath, ...args];

  try {
    const { success } = await new Deno.Command("where", {
      args: ["wt.exe"],
      stdout: "null",
      stderr: "null",
    }).output();

    if (success) {
      const innerCmd = [
        "powershell",
        "-NoProfile",
        "-Command",
        `"${exePath} ${relaunchArgs.join(" ")}"`,
      ];

      new Deno.Command("wt.exe", {
        args: [
          "powershell",
          "-NoProfile",
          "-Command",
          `Start-Process -FilePath 'wt.exe' -ArgumentList '${
            innerCmd.join(" ")
          }' -Verb RunAs`,
        ],
      }).spawn();

      //console.log(curentConsolePID)

      // Закрываем исходный терминал после успешного запуска
      //await stopProcess(curentConsolePID);
      Deno.exit(0);
    }
  } catch {
    console.log("Warning: Не удалось найти Windows Terminal (wt.exe).");
  }

  new Deno.Command("powershell", {
    args: [
      "-NoProfile",
      "-Command",
      `$proc = Start-Process -FilePath "${exePath}" -ArgumentList "${
        relaunchArgs.join(" ")
      }" -Verb RunAs -PassThru;`,
    ],
  }).spawn();

  Deno.exit(0);
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
  const strategy: DPIStrategy = config.strategys[strategy_index];
  const args = strategy.arguments.map((arg) => {
    arg = arg.replace("{{LIST_PATH}}", `${listsPath}\\`);
    arg = arg.replace("{{BIN_PATH}}", `${binPath}\\`);
    return arg;
  });

  console.log(args);

  return args;
};

const startProcess = (args: string[]) => {
  const command = new Deno.Command(winwsPath, {
    args: args,
    stdout: "inherit",
    stderr: "inherit",
  });

  const childProcess = command.spawn();

  write(`Процесс запущен с PID: ${childProcess.pid}`);
};

const startZapretAsService = async (args: string[]) => {
  const serviceName = processNames.zapret;

  // Если служба уже существует — удаляем её
  const { exist } = await serviceStatus(serviceName);
  if (exist) {
    await stopServiceAndDelete(serviceName);
  }

  // Собираем полную команду запуска (exe + аргументы)
  const binCmd = `${winwsPath} ${args.join(" ")}`;

  // Создаём службу с автозапуском
  const createResult = await executeCommand(
    "sc.exe",
    [
      "create",
      serviceName,
      "binPath=",
      binCmd,
      "start=",
      "auto",
    ],
    `создания службы ${serviceName}`,
  );
  if (!createResult || createResult.code !== 0) {
    console.error(
      `Не удалось создать службу "${serviceName}": ` +
        `${createResult?.stderr || createResult?.stdout}`,
    );
    return;
  }
  console.log(`Служба "${serviceName}" создана и настроена на автозапуск.`);

  // Запускаем службу
  const startResult = await executeCommand(
    "sc.exe",
    ["start", serviceName],
    `запуска службы ${serviceName}`,
  );
  if (!startResult || startResult.code !== 0) {
    console.error(
      `Не удалось запустить службу "${serviceName}": ` +
        `${startResult?.stderr || startResult?.stdout}`,
    );
    return;
  }
  console.log(`Служба "${serviceName}" успешно запущена.`);
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

    console.log(statusResult.stdout);

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
          ) { // Добавил "No such process" как частый вариант
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

const main = async () => {
  await ensureAdminOrRelaunch();

  let is_running = true;
  while (is_running) {
    if (Deno.build.os !== "windows") {
      console.error("Эта программа предназначена только для Windows.");
      return false;
    }
    const pin = await findProcess(processNames.winws);
    const zapret_status = await serviceStatus(processNames.zapret);
    const winDivert_status = await serviceStatus(processNames.winDivert);

    const buttons = {
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
      empty: {},
    };

    const isZapretRunning = pin ? true : false;
    const action = await promptMenu([
      isZapretRunning ? buttons.reload : buttons.start,
      isZapretRunning ? buttons.stop : buttons.empty,
      buttons.status,
      { name: "Выйти", value: "exit" },
    ], "Выберите действие:", {
      zapret: {
        autostart: zapret_status.exist,
        status: pin ? true : false,
      },
      winDivert: {
        autostart: winDivert_status.exist,
        status: winDivert_status.running,
      },
    });

    console.log('был вабран - ', action)

    type Action = "start" | "restart" | "stop" | "status" | "exit";

    const handlers: Record<Action, () => Promise<void>> = {
      start: async () => {
        // TODO: выбор стратегии

        write("\nЗапуск Zapret...");
        await startZapretAsService(processArgs(0));
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

      exit: async () => {
        is_running = false;
        write("\nВыход.");
      },
    };

    clear();
    handlers[action as Action]();

    if (action !== "exit") {
      await waitUserInput();
    }
  }
};
main();
