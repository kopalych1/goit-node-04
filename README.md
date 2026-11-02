# file-organizer

CLI-застосунок на Node.js для наведення порядку в директорії Downloads: аналізує стан директорії, шукає дублікати, сортує файли по категоріях та видаляє застарілі дані.

Зовнішніх залежностей немає, використовуються лише вбудовані модулі Node.js.

## Можливості

- **scan**: рекурсивне сканування директорії зі статистикою (кількість, розміри, типи, вік файлів)
- **duplicates**: пошук файлів з однаковим вмістом за SHA-256 хешем
- **organize**: копіювання файлів по категоріях (Documents, Images, Archives, Code, Videos, Other)
- **cleanup**: пошук і видалення файлів старіших за вказану кількість днів, з режимом попереднього перегляду (dry run)

## Встановлення

Потрібен [Node.js](https://nodejs.org/) версії 18 або новіше.

```bash
git clone <repository-url>
cd file-organizer
```

Встановлювати залежності не потрібно. Проєкт використовує ES Modules (`"type": "module"` у `package.json`).

## Швидкий старт

```bash
node file-organizer.js scan ~/Downloads
node file-organizer.js duplicates ~/Downloads
node file-organizer.js organize ~/Downloads --output ~/Organized
node file-organizer.js cleanup ~/Downloads --older-than 90
```

Ті самі команди можна запускати через npm-скрипти. Подвійний дефіс `--` передає всі наступні аргументи в скрипт:

```bash
npm run scan -- ~/Downloads
npm run duplicates -- ~/Downloads
npm run organize -- ~/Downloads --output ~/Organized
npm run cleanup -- ~/Downloads --older-than 90 --confirm
```

## Команди

### `scan <directory>`

Рекурсивно обходить директорію та всі піддиректорії й виводить звіт:

- загальна кількість файлів та сумарний розмір
- розподіл за типом (розширенням): кількість і розмір
- розподіл за віком: останні 7 днів, останні 30 днів, старіші за 90 днів
- топ-3 найбільших файли
- найстаріший файл

```bash
node file-organizer.js scan ~/Downloads
```

```
📂 Scanning: /Users/student/Downloads
Processing... ████████████████████ 247/247

📊 Scan Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total files: 247
Total size: 1.20 GB

By File Type:
  .pdf       89 files   456.0 MB
  .zip       23 files   234.0 MB
  ...

File Age:
  Last 7 days:    45 files
  Last 30 days:   89 files
  Older than 90:  56 files

Largest files:
  1. video_lecture.mp4  450.0 MB
  ...

Oldest file: old_report.pdf (modified 365 days ago)
```

Файли, до яких немає доступу, пропускаються з попередженням, а сканування триває далі.

### `duplicates <directory>`

Знаходить файли з однаковим вмістом, навіть якщо назви різні. Для кожного файлу обчислюється SHA-256 хеш. Файли з однаковим хешем потрапляють в одну групу.

```bash
node file-organizer.js duplicates ~/Downloads
```

Для кожної групи виводяться хеш, розмір, повні шляхи всіх копій та витрачене місце. Витрачене місце рахується як `розмір файлу × (кількість копій − 1)`. Групи відсортовані за витраченим місцем. Порожні файли в пошуку не враховуються.

Хеш рахується потоково (`fs.createReadStream`), тому великі файли не завантажуються в пам'ять повністю.

### `organize <directory> --output <target>`

Копіює файли з `<directory>` у `<target>`, розкладаючи їх по категоріях. Оригінали залишаються на місці.

```bash
node file-organizer.js organize ~/Downloads --output ~/Organized
```

| Аргумент            | Опис                                                                       |
| ------------------- | -------------------------------------------------------------------------- |
| `<directory>`       | Вихідна директорія (скануватиметься рекурсивно)                            |
| `--output <target>` | Цільова директорія, обов'язковий аргумент. Якщо її немає, вона створюється |

Категорії визначаються за розширенням:

| Категорія | Розширення                           |
| --------- | ------------------------------------ |
| Documents | .pdf .docx .doc .txt .md .xlsx .pptx |
| Images    | .png .jpg .jpeg .gif .svg .webp .bmp |
| Archives  | .zip .rar .tar .gz .7z               |
| Code      | .js .py .java .cpp .html .css .json  |
| Videos    | .mp4 .avi .mkv .mov .webm            |
| Other     | усе інше                             |

Особливості:

- Файли менше 10 MB копіюються через `fs.copyFile()`, а файли від 10 MB через `stream.pipeline()`.
- Існуючі файли в цільовій директорії не перезаписуються. До назви додається суфікс: `file.pdf` → `file(1).pdf` → `file(2).pdf`.
- Якщо цільова директорія лежить усередині вихідної, її вміст у копіюванні не бере участі.
- Помилка на одному файлі не зупиняє копіювання решти. Така помилка виводиться, а в підсумку показується кількість невдалих файлів.

### `cleanup <directory> --older-than <days> [--confirm]`

Знаходить файли, остання модифікація яких була раніше ніж `<days>` днів тому.

```bash
# Лише показати список (dry run), нічого не видаляється
node file-organizer.js cleanup ~/Downloads --older-than 90

# Показати список і видалити файли
node file-organizer.js cleanup ~/Downloads --older-than 90 --confirm
```

| Аргумент              | Опис                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| `<directory>`         | Директорія для пошуку                                                     |
| `--older-than <days>` | Поріг віку в днях, обов'язковий аргумент                                  |
| `--confirm`           | Фактично видалити знайдені файли. Без цього прапорця працює режим dry run |

Без `--confirm` команда лише показує список, загальну кількість і розмір та повідомляє, що це dry run. З `--confirm` після списку відбувається видалення з прогрес-баром. Видалення незворотне, тому спочатку завжди запускайте команду без прапорця.

## Обробка помилок

Усі файлові операції обгорнуті в `try...catch`. Користувач бачить зрозуміле повідомлення залежно від коду помилки:

| Код               | Повідомлення                     |
| ----------------- | -------------------------------- |
| `ENOENT`          | Not found                        |
| `EACCES`, `EPERM` | Permission denied                |
| `ENOTDIR`         | Not a directory                  |
| `EMFILE`          | Too many open files              |
| `ENOSPC`          | No space left on device          |
| інші              | Unexpected error + текст помилки |

При критичній помилці програма завершується з кодом `1`, тому її можна використовувати в скриптах.

## Архітектура

Кожна команда реалізована окремим класом, що наслідується від `EventEmitter`. Класи містять лише логіку й повідомляють про прогрес подіями, а виведення в консоль (прогрес-бар, звіти) відбувається у `file-organizer.js`. Завдяки цьому класи можна використовувати повторно, наприклад у GUI чи веб-сервері.

| Клас              | Події                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Scanner`         | `scan-start`, `file-found`, `scan-warning`, `scan-complete`                                                                      |
| `DuplicateFinder` | `search-start`, `file-processed`, `warning`, `duplicates-found`                                                                  |
| `Organizer`       | `organize-start`, `folders-start`, `folder-created`, `copy-start`, `copy-complete`, `copy-error`, `warning`, `organize-complete` |
| `Cleanup`         | `cleanup-start`, `file-found`, `warning`, `file-deleted`, `delete-error`, `cleanup-complete`                                     |

## Структура проєкту

```
file-organizer/
├── package.json
├── .gitignore
├── README.md
├── file-organizer.js    # точка входу: розбір аргументів, запуск команд, вивід
└── lib/
    ├── scanner.js       # команда scan
    ├── duplicates.js    # команда duplicates
    ├── organizer.js     # команда organize
    ├── cleanup.js       # команда cleanup
    └── utils.js         # спільні функції: formatSize, drawProgressBar,
                         # describeError, collectFiles
```
