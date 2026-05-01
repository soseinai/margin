#[cfg(not(target_os = "ios"))]
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
#[cfg(target_os = "linux")]
use std::env;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(not(target_os = "ios"))]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, State, Wry};
#[cfg(not(target_os = "ios"))]
use tauri::{Runtime, Url};

#[cfg(not(target_os = "ios"))]
const RECENT_MENU_ID: &str = "file_open_recent";
#[cfg(not(target_os = "ios"))]
const RECENT_MENU_ITEM_PREFIX: &str = "file_recent_";
#[cfg(not(target_os = "ios"))]
const CLEAR_RECENT_MENU_ITEM_PREFIX: &str = "file_clear_recent_";
const RECENT_DOCUMENT_LIMIT: usize = 10;
const RECENT_DOCUMENTS_FILE_NAME: &str = "recent-documents.json";
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
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NativeMarkdownDocumentChange {
    path: String,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecentDocumentEntry {
    title: String,
    path: String,
    #[serde(default)]
    opened_at: u64,
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

#[cfg(not(target_os = "ios"))]
#[derive(Default)]
struct WatchedDocumentState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[cfg(not(target_os = "ios"))]
#[derive(Default)]
struct RecentDocumentsMenuState {
    menu: Mutex<Option<Submenu<Wry>>>,
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
fn watch_markdown_document(
    app: AppHandle,
    state: State<WatchedDocumentState>,
    path: String,
) -> Result<(), String> {
    let path = PathBuf::from(path)
        .canonicalize()
        .map_err(|err| format!("Unable to watch document: {err}"))?;

    ensure_markdown_path(&path)?;

    let parent = path
        .parent()
        .ok_or_else(|| "Unable to watch document without a parent directory".to_string())?
        .to_path_buf();
    let key = path.to_string_lossy().to_string();
    let mut watchers = state
        .watchers
        .lock()
        .expect("watched document state poisoned");

    if watchers.contains_key(&key) {
        return Ok(());
    }

    let watched_path = path.clone();
    let watched_path_string = key.clone();
    let app_handle = app.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| match result {
            Ok(event) => {
                if should_emit_document_change(&event, &watched_path) {
                    let _ = app_handle.emit(
                        "margin://document-changed",
                        NativeMarkdownDocumentChange {
                            path: watched_path_string.clone(),
                        },
                    );
                }
            }
            Err(err) => eprintln!("Unable to watch Markdown document: {err}"),
        },
        Config::default(),
    )
    .map_err(|err| format!("Unable to watch {}: {err}", display_name(&path)))?;

    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|err| format!("Unable to watch {}: {err}", display_name(&path)))?;
    watchers.insert(key, watcher);

    Ok(())
}

#[cfg(target_os = "ios")]
#[tauri::command]
fn watch_markdown_document(_path: String) -> Result<(), String> {
    Ok(())
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

#[cfg(not(target_os = "ios"))]
#[tauri::command]
fn show_comment_context_menu(window: tauri::WebviewWindow, x: f64, y: f64) -> Result<(), String> {
    let add_comment = MenuItem::with_id(
        window.app_handle(),
        "context_add_comment",
        "Add Comment",
        true,
        Some("CmdOrCtrl+Alt+M"),
    )
    .map_err(|err| err.to_string())?;
    let menu =
        Menu::with_items(window.app_handle(), &[&add_comment]).map_err(|err| err.to_string())?;

    window
        .popup_menu_at(&menu, tauri::LogicalPosition::new(x, y))
        .map_err(|err| err.to_string())
}

#[cfg(target_os = "ios")]
#[tauri::command]
fn show_comment_context_menu(_x: f64, _y: f64) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
fn confirm_close_tab(title: String) -> bool {
    let title = if title.trim().is_empty() {
        "this tab"
    } else {
        title.trim()
    };

    matches!(
        rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Warning)
            .set_title("Close Tab?")
            .set_description(format!(
                "{title} has unsaved changes. If you close it now, those changes will be discarded."
            ))
            .set_buttons(rfd::MessageButtons::OkCancelCustom(
                "Discard and Close".to_string(),
                "Cancel".to_string(),
            ))
            .show(),
        rfd::MessageDialogResult::Custom(value) if value == "Discard and Close"
    )
}

#[cfg(target_os = "ios")]
#[tauri::command]
fn confirm_close_tab(_title: String) -> bool {
    false
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
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
fn read_settings(app: AppHandle) -> Result<AppSettings, String> {
    read_settings_file(&app)
}

#[tauri::command]
fn write_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let settings = AppSettings {
        theme: normalized_theme(&settings.theme).to_string(),
    };
    let path = settings_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Unable to create settings directory: {err}"))?;
    }

    fs::write(&path, settings_toml(&settings))
        .map_err(|err| format!("Unable to write {}: {err}", display_name(&path)))?;

    Ok(settings)
}

#[tauri::command]
fn read_recent_documents(app: AppHandle) -> Result<Vec<RecentDocumentEntry>, String> {
    read_recent_documents_file(&app)
}

#[cfg(not(target_os = "ios"))]
#[tauri::command]
fn write_recent_documents(
    app: AppHandle,
    menu_state: State<RecentDocumentsMenuState>,
    entries: Vec<RecentDocumentEntry>,
) -> Result<Vec<RecentDocumentEntry>, String> {
    let entries = normalized_recent_documents(entries);

    write_recent_documents_file(&app, &entries)?;
    update_recent_documents_menu(&app, &menu_state, &entries)?;

    Ok(entries)
}

#[cfg(target_os = "ios")]
#[tauri::command]
fn write_recent_documents(
    app: AppHandle,
    entries: Vec<RecentDocumentEntry>,
) -> Result<Vec<RecentDocumentEntry>, String> {
    let entries = normalized_recent_documents(entries);

    write_recent_documents_file(&app, &entries)?;

    Ok(entries)
}

#[cfg(not(target_os = "ios"))]
fn set_recent_documents_menu_entries(
    app: &AppHandle,
    recent_menu: &Submenu<Wry>,
    entries: &[RecentDocumentEntry],
) -> Result<(), String> {
    clear_submenu(recent_menu)?;

    let nonce = recent_menu_nonce();

    if entries.is_empty() {
        let empty = MenuItem::with_id(
            app,
            format!("file_recent_empty_{nonce}"),
            "No Recent Documents",
            false,
            None::<&str>,
        )
        .map_err(|err| err.to_string())?;
        recent_menu.append(&empty).map_err(|err| err.to_string())?;
        return Ok(());
    }

    for (index, entry) in entries.iter().take(RECENT_DOCUMENT_LIMIT).enumerate() {
        let item = MenuItem::with_id(
            app,
            format!("{RECENT_MENU_ITEM_PREFIX}{nonce}_{index}"),
            recent_menu_label(&entry.title),
            true,
            None::<&str>,
        )
        .map_err(|err| err.to_string())?;
        recent_menu.append(&item).map_err(|err| err.to_string())?;
    }

    let separator = PredefinedMenuItem::separator(app).map_err(|err| err.to_string())?;
    let clear = MenuItem::with_id(
        app,
        format!("{CLEAR_RECENT_MENU_ITEM_PREFIX}{nonce}"),
        "Clear Menu",
        true,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    recent_menu
        .append_items(&[&separator, &clear])
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[cfg(not(target_os = "ios"))]
fn update_recent_documents_menu(
    app: &AppHandle,
    menu_state: &State<RecentDocumentsMenuState>,
    entries: &[RecentDocumentEntry],
) -> Result<(), String> {
    let recent_menu = menu_state
        .menu
        .lock()
        .expect("recent documents menu state poisoned")
        .clone()
        .ok_or_else(|| "Recent documents menu is not available".to_string())?;

    set_recent_documents_menu_entries(app, &recent_menu, entries)
}

#[cfg(target_os = "ios")]
fn ios_file_picker_message() -> String {
    "Native document picking is not available in the iOS preview yet.".to_string()
}

fn read_settings_file(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|err| format!("Unable to read {}: {err}", display_name(&path)))?;
    Ok(parse_settings_toml(&contents))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|err| format!("Unable to locate app config directory: {err}"))?
        .join(SETTINGS_FILE_NAME))
}

fn recent_documents_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_state_dir(app)?.join(RECENT_DOCUMENTS_FILE_NAME))
}

fn app_state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    {
        linux_app_state_dir(app)
    }

    #[cfg(not(target_os = "linux"))]
    {
        app.path()
            .app_data_dir()
            .map_err(|err| format!("Unable to locate app data directory: {err}"))
    }
}

#[cfg(target_os = "linux")]
fn linux_app_state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("XDG_STATE_HOME").map(PathBuf::from) {
        if path.is_absolute() {
            return Ok(path.join(&app.config().identifier));
        }
    }

    env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| {
            home.join(".local")
                .join("state")
                .join(&app.config().identifier)
        })
        .ok_or_else(|| "Unable to locate home directory for app state".to_string())
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

fn read_recent_documents_file(app: &AppHandle) -> Result<Vec<RecentDocumentEntry>, String> {
    let path = recent_documents_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|err| format!("Unable to read {}: {err}", display_name(&path)))?;
    let entries = serde_json::from_str::<Vec<RecentDocumentEntry>>(&contents)
        .map_err(|err| format!("Unable to parse {}: {err}", display_name(&path)))?;

    Ok(normalized_recent_documents(entries))
}

fn write_recent_documents_file(
    app: &AppHandle,
    entries: &[RecentDocumentEntry],
) -> Result<(), String> {
    let path = recent_documents_path(app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Unable to create app data directory: {err}"))?;
    }

    let contents = serde_json::to_string_pretty(entries)
        .map_err(|err| format!("Unable to encode recent documents: {err}"))?;

    fs::write(&path, contents)
        .map_err(|err| format!("Unable to write {}: {err}", display_name(&path)))
}

fn normalized_recent_documents(entries: Vec<RecentDocumentEntry>) -> Vec<RecentDocumentEntry> {
    let mut seen_paths = HashSet::new();
    let mut normalized = Vec::new();

    for entry in entries {
        let path = entry.path.trim();

        if path.is_empty() || !seen_paths.insert(path.to_string()) {
            continue;
        }

        let title = if entry.title.trim().is_empty() {
            display_name(Path::new(path))
        } else {
            entry.title.trim().to_string()
        };

        normalized.push(RecentDocumentEntry {
            title,
            path: path.to_string(),
            opened_at: entry.opened_at,
        });

        if normalized.len() >= RECENT_DOCUMENT_LIMIT {
            break;
        }
    }

    normalized
}

fn read_markdown_document_from_path(path: &Path) -> Result<NativeMarkdownDocument, String> {
    ensure_markdown_path(path)?;
    let markdown = fs::read_to_string(path)
        .map_err(|err| format!("Unable to read {}: {err}", display_name(path)))?;
    Ok(markdown_document_payload(path, markdown))
}

#[cfg(not(target_os = "ios"))]
fn should_emit_document_change(event: &Event, watched_path: &Path) -> bool {
    let relevant_kind = matches!(
        &event.kind,
        EventKind::Any | EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    );

    relevant_kind && event.paths.iter().any(|path| path == watched_path)
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

#[cfg(not(target_os = "ios"))]
fn recent_menu_nonce() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

#[cfg(not(target_os = "ios"))]
fn recent_document_menu_index(menu_id: &str) -> Option<usize> {
    let suffix = menu_id.strip_prefix(RECENT_MENU_ITEM_PREFIX)?;

    let (nonce, index) = suffix.rsplit_once('_')?;

    if nonce.is_empty() || !nonce.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }

    index.parse().ok()
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
    let builder = builder
        .manage(WatchedDocumentState::default())
        .manage(RecentDocumentsMenuState::default());

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
            #[cfg(target_os = "macos")]
            let mut settings_item_added = false;
            #[cfg(not(target_os = "macos"))]
            let settings_item_added = false;

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

            let insert_comment = MenuItem::with_id(
                app,
                "insert_comment",
                "Comment",
                true,
                Some("CmdOrCtrl+Alt+M"),
            )?;
            let insert_comment_separator = PredefinedMenuItem::separator(app)?;
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
                    &insert_comment,
                    &insert_comment_separator,
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
                let item_count = window_menu.items()?.len();
                for index in (0..item_count).rev() {
                    window_menu.remove_at(index)?;
                }

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
                let minimize_window = PredefinedMenuItem::minimize(app, None)?;
                let maximize_window = PredefinedMenuItem::maximize(app, None)?;

                window_menu.append_items(&[
                    &previous_tab,
                    &next_tab,
                    &tab_separator,
                    &minimize_window,
                    &maximize_window,
                ])?;
            }

            app.set_menu(menu)?;

            let app_handle = app.handle().clone();
            let recent_menu_state = app.state::<RecentDocumentsMenuState>();

            *recent_menu_state
                .menu
                .lock()
                .expect("recent documents menu state poisoned") = Some(open_recent.clone());

            match read_recent_documents_file(&app_handle) {
                Ok(entries) if !entries.is_empty() => {
                    if let Err(err) =
                        set_recent_documents_menu_entries(&app_handle, &open_recent, &entries)
                    {
                        eprintln!("Unable to restore recent documents menu: {err}");
                    }
                }
                Err(err) => eprintln!("Unable to read recent documents: {err}"),
                _ => {}
            }
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
        } else if let Some(index) = recent_document_menu_index(menu_id.as_ref()) {
            let _ = app.emit("margin://open-recent-document", index);
        } else if menu_id.as_ref().starts_with(CLEAR_RECENT_MENU_ITEM_PREFIX) {
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
        } else if matches!(menu_id.as_ref(), "insert_comment" | "context_add_comment") {
            let _ = app.emit("margin://add-comment", ());
        } else if let Some(kind) = insert_payload(menu_id.as_ref()) {
            let _ = app.emit("margin://insert-block", kind);
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            take_pending_open_urls,
            choose_markdown_document,
            open_markdown_document,
            watch_markdown_document,
            choose_markdown_save_path,
            show_comment_context_menu,
            confirm_close_tab,
            quit_app,
            save_markdown_document,
            read_settings,
            write_settings,
            read_recent_documents,
            write_recent_documents
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Margin desktop app")
        .run(|app_handle, event| match event {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            tauri::RunEvent::Opened { urls } => {
                dispatch_native_open_urls(
                    app_handle,
                    urls.into_iter().map(|url| url.to_string()).collect(),
                );
            }
            _ => {
                #[cfg(not(any(target_os = "macos", target_os = "ios")))]
                let _ = app_handle;
            }
        });
}
