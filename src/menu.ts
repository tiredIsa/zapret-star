import config from "./config/config.json" with { type: "json" };

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K";

export function write(s: string) {
  const encoder = new TextEncoder();
  Deno.stdout.write(encoder.encode(s));
}

export async function clear() {
  if (Deno.env.get("WT_SESSION")) {
    write("\x1b[2J\x1b[H\x1b[3J");
  } else {
    // clear using cls cause cmd is trash
    const command = new Deno.Command("cmd", {
      args: ["/c", "cls"],
      stdout: "inherit",
      stderr: "inherit",
    });
    try {
      const status = await command.output();

      if (!status.success) {
        console.error(`Не удалось выполнить cls. Код выхода: ${status.code}`);
      }
    } catch (error) {
      console.error("Ошибка при вызове cls:", error);
    }
  }
}

const drawHeader = (
  zapret: { status: boolean; autostart: boolean },
  winDivert: { status: boolean; autostart: boolean },
) => {
  const zapret_status = zapret.status ? `Активно  ` : `Выключено`;
  const zapret_autostart = zapret.autostart ? ` Включено` : `Выключено`;

  const winDivert_status = winDivert.status ? `Активно  ` : `Выключено`;
  const winDivert_autostart = winDivert.autostart ? ` Включено ` : `Выключено`;

  const logo = [
    `Автор: tiredIsa                                                               Версия: ${config.version}`,
    `▒███████▒ ▄▄▄       ██▓███   ██▀███  ▓█████▄▄▄█████▓    ██████ ▄▄▄█████▓ ▄▄▄       ██▀███  `,
    `▒ ▒ ▒ ▄▀░▒████▄    ▓██░  ██▒▓██ ▒ ██▒▓█   ▀▓  ██▒ ▓▒  ▒██    ▒ ▓  ██▒ ▓▒▒████▄    ▓██ ▒ ██▒`,
    `░ ▒ ▄▀▒░ ▒██  ▀█▄  ▓██░ ██▓▒▓██ ░▄█ ▒▒███  ▒ ▓██░ ▒░  ░ ▓██▄   ▒ ▓██░ ▒░▒██  ▀█▄  ▓██ ░▄█ ▒`,
    `  ▄▀▒   ░░██▄▄▄▄██ ▒██▄█▓▒ ▒▒██▀▀█▄  ▒▓█  ▄░ ▓██▓ ░     ▒   ██▒░ ▓██▓ ░ ░██▄▄▄▄██ ▒██▀▀█▄  `,
    `▒███████▒ ▓█   ▓██▒▒██▒ ░  ░░██▓ ▒██▒░▒████▒ ▒██▒ ░   ▒██████▒▒  ▒██▒ ░  ▓█   ▓██▒░██▓ ▒██▒`,
    `░▒▒ ▓░▒░▒ ▒▒   ▓▒█░▒▓▒░ ░  ░░ ▒▓ ░▒▓░░░ ▒░ ░ ▒ ░░     ▒ ▒▓▒ ▒ ░  ▒ ░░    ▒▒   ▓▒█░░ ▒▓ ░▒▓░`,
    `░░▒ ▒ ░ ▒  ▒   ▒▒ ░░▒ ░       ░▒ ░ ▒░ ░ ░  ░   ░      ░ ░▒  ░ ░    ░      ▒   ▒▒ ░  ░▒ ░ ▒░`,
    `░ ░ ░ ░ ░  ░   ▒   ░░         ░░   ░    ░    ░        ░  ░  ░    ░        ░   ▒     ░░   ░ `,
    `  ░ ░          ░  ░            ░        ░  ░                ░                ░  ░   ░     `,
    `░                                                                                          `,
    `Статус winws: ${zapret_status}                                               Автозапуск: ${zapret_autostart}`,
    `Статус WinDivert: ${winDivert_status}                                           Автозапуск: ${winDivert_autostart}`,
    `===========================================================================================`,
    ``,
  ];

  write(logo.join("\n"));
};

export async function waitUserInput() {
  console.log("\nНажмите любую клавишу, чтобы продолжить...");
  const buffer = new Uint8Array(1);
  await Deno.stdin.read(buffer);
  return String.fromCharCode(buffer[0]);
}

export async function promptMenu(
  options: { name?: string; value?: string }[],
  prompt: string = "Select an option:",
  header?: {
    zapret: { status: boolean; autostart: boolean };
    winDivert: { status: boolean; autostart: boolean };
  },
): Promise<string | null> {
  if (!options || options.length === 0) {
    throw new Error("Options array cannot be empty.");
  }

  options = options.filter((option) => option.name && option.value);

  let selectedIndex = 0;
  const numOptions = options.length;
  const decoder = new TextDecoder();

  write(HIDE_CURSOR);
  Deno.stdin.setRaw(true);

  const redrawMenu = async () => {
    await clear();

    // TODO: в terminal не стирать header

    if (header) {
      drawHeader(
        {
          autostart: header.zapret.autostart,
          status: header.zapret.status,
        },
        {
          autostart: header.winDivert.autostart,
          status: header.winDivert.status,
        },
      );
    }

    if (prompt) {
      write(CLEAR_LINE + "\r" + prompt + "\n");
    }

    for (let i = 0; i < numOptions; i++) {
      write(CLEAR_LINE + "\r");
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? "> " : "  ";
      const itemText = options[i].name;
      write(`${prefix}${itemText}\n`);
    }
  };

  await redrawMenu();

  try {
    while (true) {
      const buffer = new Uint8Array(1024);
      const n = await Deno.stdin.read(buffer);

      if (n === null) {
        return null;
      }

      const input = decoder.decode(buffer.subarray(0, n));

      switch (input) {
        case "\x1b[A":
        case "k":
          selectedIndex = (selectedIndex - 1 + numOptions) % numOptions;
          redrawMenu();
          break;

        case "\x1b[B":
        case "j":
          selectedIndex = (selectedIndex + 1) % numOptions;
          redrawMenu();
          break;

        case "\r":
          write(`\x1b[${numOptions + (prompt ? 1 : 0)}A`);
          for (let i = 0; i < numOptions + (prompt ? 1 : 0); i++) {
            write(CLEAR_LINE + "\r" + "\n");
          }
          write(`\x1b[${numOptions + (prompt ? 1 : 0)}A`);

          return options[selectedIndex].value!;

        case "\u0003":
          return null;
      }
    }
  } finally {
    Deno.stdin.setRaw(false);
    write(SHOW_CURSOR);
  }
}
