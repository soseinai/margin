use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter,
};

#[tauri::command]
fn auth_callback_url() -> &'static str {
    "margin://auth/callback"
}

fn insert_payload(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        "insert_table" => Some("table"),
        "insert_tasks" => Some("tasks"),
        "insert_bullets" => Some("bullets"),
        "insert_numbers" => Some("numbers"),
        _ => None,
    }
}

fn format_payload(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        "format_bold" => Some("bold"),
        "format_italic" => Some("italic"),
        "format_code" => Some("code"),
        "format_link" => Some("link"),
        _ => None,
    }
}

fn file_payload(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        "file_new" => Some("new"),
        "file_open" => Some("open"),
        "file_save" => Some("save"),
        "file_save_as" => Some("save-as"),
        _ => None,
    }
}

fn file_menu_position() -> usize {
    #[cfg(target_os = "macos")]
    {
        1
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}

fn editor_menu_position() -> usize {
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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let menu = Menu::default(app.handle())?;
            let file_new = MenuItem::with_id(app, "file_new", "New", true, Some("CmdOrCtrl+N"))?;
            let file_open =
                MenuItem::with_id(app, "file_open", "Open...", true, Some("CmdOrCtrl+O"))?;
            let file_save = MenuItem::with_id(app, "file_save", "Save", true, Some("CmdOrCtrl+S"))?;
            let file_save_as = MenuItem::with_id(
                app,
                "file_save_as",
                "Save As...",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?;
            let file_separator_top = PredefinedMenuItem::separator(app)?;
            let file_separator_bottom = PredefinedMenuItem::separator(app)?;

            let format_bold =
                MenuItem::with_id(app, "format_bold", "Bold", true, Some("CmdOrCtrl+B"))?;
            let format_italic =
                MenuItem::with_id(app, "format_italic", "Italic", true, Some("CmdOrCtrl+I"))?;
            let format_code =
                MenuItem::with_id(app, "format_code", "Inline Code", true, Some("CmdOrCtrl+`"))?;
            let format_link =
                MenuItem::with_id(app, "format_link", "Link", true, Some("CmdOrCtrl+K"))?;
            let format_menu = Submenu::with_id_and_items(
                app,
                "format",
                "Format",
                true,
                &[&format_bold, &format_italic, &format_code, &format_link],
            )?;

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

            if let Some(file_menu) = menu
                .items()?
                .into_iter()
                .filter_map(|item| item.as_submenu().cloned())
                .find(|submenu| submenu.text().is_ok_and(|text| text == "File"))
            {
                file_menu.insert(&file_new, 0)?;
                file_menu.insert(&file_open, 1)?;
                file_menu.insert(&file_separator_top, 2)?;
                file_menu.insert(&file_save, 3)?;
                file_menu.insert(&file_save_as, 4)?;
                file_menu.insert(&file_separator_bottom, 5)?;
            } else {
                let file_menu = Submenu::with_id_and_items(
                    app,
                    "file",
                    "File",
                    true,
                    &[
                        &file_new,
                        &file_open,
                        &file_separator_top,
                        &file_save,
                        &file_save_as,
                    ],
                )?;
                menu.insert(&file_menu, file_menu_position())?;
            }

            let editor_position = editor_menu_position();
            menu.insert(&format_menu, editor_position)?;
            menu.insert(&insert_menu, editor_position + 1)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let menu_id = event.id().as_ref();
            if let Some(kind) = insert_payload(menu_id) {
                let _ = app.emit("margin://insert-block", kind);
            }
            if let Some(kind) = format_payload(menu_id) {
                let _ = app.emit("margin://format-markdown", kind);
            }
            if let Some(command) = file_payload(menu_id) {
                let _ = app.emit("margin://file-command", command);
            }
        })
        .invoke_handler(tauri::generate_handler![auth_callback_url])
        .run(tauri::generate_context!())
        .expect("failed to run Margin desktop app");
}
