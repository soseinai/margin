use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
#[cfg(not(target_os = "ios"))]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(not(target_os = "ios"))]
use tauri::{Runtime, Url};

#[cfg(not(target_os = "ios"))]
const RECENT_MENU_ID: &str = "file_open_recent";
#[cfg(not(target_os = "ios"))]
const RECENT_MENU_ITEM_PREFIX: &str = "file_recent_";
#[cfg(not(target_os = "ios"))]
const RECENT_MENU_LIMIT: usize = 10;
const SETTINGS_FILE_NAME: &str = "settings.toml";
const DEFAULT_THEME: &str = "auto";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeMarkdownDocument {
    path: String,
    name: String,
    markdown: String,
}

#[cfg(not(target_os = "ios"))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentDocumentMenuEntry {
    title: String,
    path: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: DEFAULT_THEME.to_string(),
        }
    }
}

#[derive(Default)]
struct NativeOpenState {
    frontend_ready: AtomicBool,
    pending_urls: Mutex<Vec<String>>,
}

#[tauri::command]
fn take_pending_open_urls(state: State<NativeOpenState>) -> Vec<String> {
    state.frontend_ready.store(true, Ordering::SeqCst);

    let mut pending_urls = state
        .pending_urls
        .lock()
        .expect("pending open URL state poisoned");
    std::mem::take(&mut *pending_urls)
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
fn choose_markdown_document() -> Result<Option<NativeMarkdownDocument>, String> {
    let picked = rfd::FileDialog::new()
        .add_filter("Markdown Documents", &["md", "markdown", "txt"])
        .pick_file();

    picked
        .map(|path| read_markdown_document_from_path(&path))
        .transpose()
}

#[cfg(target_os = "ios")]
#[tauri::command]
fn choose_markdown_document() -> Result<Option<NativeMarkdownDocument>, String> {
    Err(ios_file_picker_message())
}

#[tauri::command]
fn open_markdown_document(path: String) -> Result<NativeMarkdownDocument, String> {
    read_markdown_document_from_path(&PathBuf::from(path))
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
fn choose_markdown_save_path(suggested_name: String) -> Result<Option<String>, String> {
    let suggested_name = if suggested_name.trim().is_empty() {
        "document.md"
    } else {
        suggested_name.trim()
    };

    Ok(rfd::FileDialog::new()
        .add_filter("Markdown Documents", &["md", "markdown", "txt"])
        .set_file_name(suggested_name)
        .save_file()
        .map(normalized_save_path)
        .map(|path| path.to_string_lossy().to_string()))
}

#[cfg(target_os = "ios")]
#[tauri::command]
fn choose_markdown_save_path(_suggested_name: String) -> Result<Option<String>, String> {
    Err(ios_file_picker_message())
}

#[tauri::command]
fn save_markdown_document(
    path: String,
    markdown: String,
) -> Result<NativeMarkdownDocument, String> {
    let path = normalized_save_path(PathBuf::from(path));
    ensure_markdown_path(&path)?;
    fs::write(&path, &markdown)
        .map_err(|err| format!("Unable to save {}: {err}", display_name(&path)))?;

    Ok(markdown_document_payload(&path, markdown))
}

#[tauri::command]
fn read_settings() -> Result<AppSettings, String> {
    read_settings_file()
}

#[tauri::command]
fn write_settings(settings: AppSettings) -> Result<AppSettings, String> {
    let settings = AppSettings {
        theme: normalized_theme(&settings.theme).to_string(),
    };
    let path = settings_path()?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Unable to create settings directory: {err}"))?;
    }

    fs::write(&path, settings_toml(&settings))
        .map_err(|err| format!("Unable to write {}: {err}", display_name(&path)))?;

    Ok(settings)
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
fn set_recent_documents_menu(
    app: AppHandle,
    entries: Vec<RecentDocumentMenuEntry>,
) -> Result<(), String> {
    let app_menu = app
        .menu()
        .ok_or_else(|| "Margin menu is not available".to_string())?;
    let recent_menu = app_menu
        .get(RECENT_MENU_ID)
        .and_then(|item| item.as_submenu().cloned())
        .ok_or_else(|| "Recent documents menu is not available".to_string())?;

    clear_submenu(&recent_menu)?;

    if entries.is_empty() {
        let empty = MenuItem::with_id(
            &app,
            "file_recent_empty",
            "No Recent Documents",
            false,
            None::<&str>,
        )
        .map_err(|err| err.to_string())?;
        recent_menu.append(&empty).map_err(|err| err.to_string())?;
        return Ok(());
    }

    for (index, entry) in entries.iter().take(RECENT_MENU_LIMIT).enumerate() {
        let _ = &entry.path;
        let item = MenuItem::with_id(
            &app,
            format!("{RECENT_MENU_ITEM_PREFIX}{index}"),
            recent_menu_label(&entry.title),
            true,
            None::<&str>,
        )
        .map_err(|err| err.to_string())?;
        recent_menu.append(&item).map_err(|err| err.to_string())?;
    }

    let separator = PredefinedMenuItem::separator(&app).map_err(|err| err.to_string())?;
    let clear = MenuItem::with_id(&app, "file_clear_recent", "Clear Menu", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    recent_menu
        .append_items(&[&separator, &clear])
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[cfg(target_os = "ios")]
#[tauri::command]
fn set_recent_documents_menu(
    _app: AppHandle,
    _entries: Vec<serde_json::Value>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "ios")]
fn ios_file_picker_message() -> String {
    "Native document picking is not available in the iOS preview yet.".to_string()
}

fn read_settings_file() -> Result<AppSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|err| format!("Unable to read {}: {err}", display_name(&path)))?;
    Ok(parse_settings_toml(&contents))
}

fn settings_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to locate home directory for settings".to_string())?;
    Ok(home.join(".config").join("margin").join(SETTINGS_FILE_NAME))
}

fn parse_settings_toml(contents: &str) -> AppSettings {
    let mut settings = AppSettings::default();

    for line in contents.lines() {
        let line = line.split('#').next().unwrap_or("").trim();
        let Some(value) = line
            .strip_prefix("theme")
            .and_then(|rest| rest.trim_start().strip_prefix('='))
        else {
            continue;
        };

        settings.theme =
            normalized_theme(value.trim().trim_matches('"').trim_matches('\'')).to_string();
    }

    settings
}

fn settings_toml(settings: &AppSettings) -> String {
    format!("theme = \"{}\"\n", normalized_theme(&settings.theme))
}

fn normalized_theme(theme: &str) -> &'static str {
    match theme.trim().to_ascii_lowercase().as_str() {
        "light" => "light",
        "dark" => "dark",
        _ => DEFAULT_THEME,
    }
}

fn read_markdown_document_from_path(path: &Path) -> Result<NativeMarkdownDocument, String> {
    ensure_markdown_path(path)?;
    let markdown = fs::read_to_string(path)
        .map_err(|err| format!("Unable to read {}: {err}", display_name(path)))?;
    Ok(markdown_document_payload(path, markdown))
}

fn markdown_document_payload(path: &Path, markdown: String) -> NativeMarkdownDocument {
    let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

    NativeMarkdownDocument {
        name: display_name(&path),
        path: path.to_string_lossy().to_string(),
        markdown,
    }
}

fn ensure_markdown_path(path: &Path) -> Result<(), String> {
    if is_markdown_path(path) {
        Ok(())
    } else {
        Err("Margin can open Markdown, Markdown-like, or plain text documents.".to_string())
    }
}

fn normalized_save_path(mut path: PathBuf) -> PathBuf {
    if path.extension().is_none() {
        path.set_extension("md");
    }
    path
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled.md")
        .to_string()
}

#[cfg(not(target_os = "ios"))]
fn clear_submenu<R: Runtime>(menu: &Submenu<R>) -> Result<(), String> {
    let item_count = menu.items().map_err(|err| err.to_string())?.len();
    for index in (0..item_count).rev() {
        menu.remove_at(index).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "ios"))]
fn recent_menu_label(title: &str) -> String {
    const MAX_CHARS: usize = 52;
    if title.chars().count() <= MAX_CHARS {
        return title.to_string();
    }

    let mut label = title.chars().take(MAX_CHARS - 1).collect::<String>();
    label.push_str("...");
    label
}

fn dispatch_native_open_urls(app: &AppHandle, urls: Vec<String>) {
    if urls.is_empty() {
        return;
    }

    #[cfg(not(target_os = "ios"))]
    {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }

    let state = app.state::<NativeOpenState>();
    if state.frontend_ready.load(Ordering::SeqCst) {
        let _ = app.emit("margin://open-urls", urls);
        return;
    }

    let mut pending_urls = state
        .pending_urls
        .lock()
        .expect("pending open URL state poisoned");
    pending_urls.extend(urls);
}

#[cfg(not(target_os = "ios"))]
fn launch_urls_from_args(args: Vec<String>) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter_map(launch_url_from_arg)
        .collect()
}

#[cfg(not(target_os = "ios"))]
fn launch_url_from_arg(arg: String) -> Option<String> {
    if arg.starts_with("margin://") || arg.starts_with("file://") {
        return Some(arg);
    }

    let path = PathBuf::from(&arg);
    if !path.exists() || !is_markdown_path(&path) {
        return None;
    }

    Url::from_file_path(path).ok().map(|url| url.to_string())
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt"
            )
        })
        .unwrap_or(false)
}

#[cfg(not(target_os = "ios"))]
fn insert_payload(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        "insert_table" => Some("table"),
        "insert_tasks" => Some("tasks"),
        "insert_bullets" => Some("bullets"),
        "insert_numbers" => Some("numbers"),
        _ => None,
    }
}

#[cfg(not(target_os = "ios"))]
fn insert_menu_position() -> usize {
    #[cfg(target_os = "macos")]
    {
        3
    }
    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    {
        1
    }
    #[cfg(not(any(
        target_os = "macos",
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )))]
    {
        2
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(NativeOpenState::default())
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(not(target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        dispatch_native_open_urls(app, launch_urls_from_args(args));
    }));

    let builder = builder.setup(|app| {
        #[cfg(not(target_os = "ios"))]
        {
            let menu = Menu::default(app.handle())?;
            let settings_item = MenuItem::with_id(
                app,
                "app_settings",
                "Settings...",
                true,
                Some("CmdOrCtrl+,"),
            )?;
            let settings_separator = PredefinedMenuItem::separator(app)?;
            let mut settings_item_added = false;

            #[cfg(target_os = "macos")]
            if let Some(app_menu) = menu
                .items()?
                .first()
                .and_then(|item| item.as_submenu().cloned())
            {
                app_menu.insert_items(&[&settings_item], 1)?;
                settings_item_added = true;
            }

            let new_file = MenuItem::with_id(app, "file_new", "New", true, Some("CmdOrCtrl+N"))?;
            let open_file =
                MenuItem::with_id(app, "file_open", "Open...", true, Some("CmdOrCtrl+O"))?;
            let recent_empty = MenuItem::with_id(
                app,
                "file_recent_empty",
                "No Recent Documents",
                false,
                None::<&str>,
            )?;
            let open_recent = Submenu::with_id_and_items(
                app,
                RECENT_MENU_ID,
                "Open Recent",
                true,
                &[&recent_empty],
            )?;
            let save_file = MenuItem::with_id(app, "file_save", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_file_as = MenuItem::with_id(
                app,
                "file_save_as",
                "Save As...",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?;
            let file_open_separator = PredefinedMenuItem::separator(app)?;
            let file_save_separator = PredefinedMenuItem::separator(app)?;
            let close_tab = MenuItem::with_id(
                app,
                "file_close_tab",
                "Close Tab",
                true,
                Some("CmdOrCtrl+W"),
            )?;
            let close_window = MenuItem::with_id(
                app,
                "file_close_window",
                "Close Window",
                true,
                Some("CmdOrCtrl+Shift+W"),
            )?;
            if let Some(file_menu) = menu.items()?.into_iter().find_map(|item| {
                item.as_submenu()
                    .cloned()
                    .filter(|submenu| submenu.text().map(|text| text == "File").unwrap_or(false))
            }) {
                let item_count = file_menu.items()?.len();
                for index in (0..item_count).rev() {
                    file_menu.remove_at(index)?;
                }
                file_menu.append_items(&[
                    &new_file,
                    &open_file,
                    &open_recent,
                    &file_open_separator,
                    &save_file,
                    &save_file_as,
                    &file_save_separator,
                    &close_tab,
                    &close_window,
                ])?;

                if !settings_item_added {
                    file_menu.insert_items(&[&settings_item, &settings_separator], 0)?;
                }
            }

            let insert_table = MenuItem::with_id(
                app,
                "insert_table",
                "Table",
                true,
                Some("CmdOrCtrl+Shift+T"),
            )?;
            let insert_tasks = MenuItem::with_id(
                app,
                "insert_tasks",
                "Task List",
                true,
                Some("CmdOrCtrl+Shift+X"),
            )?;
            let insert_bullets = MenuItem::with_id(
                app,
                "insert_bullets",
                "Bulleted List",
                true,
                Some("CmdOrCtrl+Shift+8"),
            )?;
            let insert_numbers = MenuItem::with_id(
                app,
                "insert_numbers",
                "Numbered List",
                true,
                Some("CmdOrCtrl+Shift+7"),
            )?;
            let insert_menu = Submenu::with_id_and_items(
                app,
                "insert",
                "Insert",
                true,
                &[
                    &insert_table,
                    &insert_tasks,
                    &insert_bullets,
                    &insert_numbers,
                ],
            )?;

            menu.insert(&insert_menu, insert_menu_position())?;

            if let Some(window_menu) = menu.items()?.into_iter().find_map(|item| {
                item.as_submenu()
                    .cloned()
                    .filter(|submenu| submenu.text().map(|text| text == "Window").unwrap_or(false))
            }) {
                let previous_tab = MenuItem::with_id(
                    app,
                    "window_previous_tab",
                    "Show Previous Tab",
                    true,
                    Some("CmdOrCtrl+Shift+["),
                )?;
                let next_tab = MenuItem::with_id(
                    app,
                    "window_next_tab",
                    "Show Next Tab",
                    true,
                    Some("CmdOrCtrl+Shift+]"),
                )?;
                let tab_separator = PredefinedMenuItem::separator(app)?;
                window_menu.insert_items(&[&previous_tab, &next_tab, &tab_separator], 0)?;
            }

            app.set_menu(menu)?;
        }

        #[cfg(target_os = "ios")]
        {
            let _ = app;
        }

        Ok(())
    });

    #[cfg(not(target_os = "ios"))]
    let builder = builder.on_menu_event(|app, event| {
        let menu_id = event.id();
        if menu_id.as_ref() == "app_settings" {
            let _ = app.emit("margin://open-settings", ());
        } else if menu_id.as_ref() == "file_new" {
            let _ = app.emit("margin://new-document", ());
        } else if menu_id.as_ref() == "file_open" {
            let _ = app.emit("margin://open-document", ());
        } else if let Some(index) = menu_id
            .as_ref()
            .strip_prefix(RECENT_MENU_ITEM_PREFIX)
            .and_then(|value| value.parse::<usize>().ok())
        {
            let _ = app.emit("margin://open-recent-document", index);
        } else if menu_id.as_ref() == "file_clear_recent" {
            let _ = app.emit("margin://clear-recent-documents", ());
        } else if menu_id.as_ref() == "file_save" {
            let _ = app.emit("margin://save-document", ());
        } else if menu_id.as_ref() == "file_save_as" {
            let _ = app.emit("margin://save-document-as", ());
        } else if menu_id.as_ref() == "file_close_tab" {
            let _ = app.emit("margin://close-tab", ());
        } else if menu_id.as_ref() == "file_close_window" {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.close();
            }
        } else if menu_id.as_ref() == "window_previous_tab" {
            let _ = app.emit("margin://previous-tab", ());
        } else if menu_id.as_ref() == "window_next_tab" {
            let _ = app.emit("margin://next-tab", ());
        } else if let Some(kind) = insert_payload(menu_id.as_ref()) {
            let _ = app.emit("margin://insert-block", kind);
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            take_pending_open_urls,
            choose_markdown_document,
            open_markdown_document,
            choose_markdown_save_path,
            save_markdown_document,
            read_settings,
            write_settings,
            set_recent_documents_menu
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Margin desktop app")
        .run(|app, event| match event {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            tauri::RunEvent::Opened { urls } => {
                dispatch_native_open_urls(
                    app,
                    urls.into_iter().map(|url| url.to_string()).collect(),
                );
            }
            _ => {}
        });
}
