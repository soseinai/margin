use tauri::{
    menu::{Menu, MenuItem, Submenu},
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

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let menu = Menu::default(app.handle())?;
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
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if let Some(kind) = insert_payload(event.id().as_ref()) {
                let _ = app.emit("margin://insert-block", kind);
            }
        })
        .invoke_handler(tauri::generate_handler![auth_callback_url])
        .run(tauri::generate_context!())
        .expect("failed to run Margin desktop app");
}
