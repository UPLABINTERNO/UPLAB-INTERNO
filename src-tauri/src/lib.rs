mod commands;
mod core;
mod modules;

use tauri::Manager;

use crate::core::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Banco em diretório de dados do app.
            let dir = app.path().app_data_dir().expect("app_data_dir");
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("uplab.db");
            let conn = core::db::init(&db_path).expect("falha ao inicializar o banco");
            app.manage(AppState::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Núcleo
            commands::auth_module_login,
            commands::auth_module_logout,
            commands::permissions_check,
            commands::modules_catalog,
            // Módulo Financeiro
            modules::financeiro::financeiro_list,
            modules::financeiro::financeiro_create,
            modules::financeiro::financeiro_update,
            modules::financeiro::financeiro_delete,
            // Módulo Administrador
            modules::administrador::admin_users_list,
            modules::administrador::admin_user_create,
            modules::administrador::admin_user_update,
            modules::administrador::admin_user_delete,
            modules::administrador::admin_roles_list,
            modules::administrador::admin_role_create,
            modules::administrador::admin_role_update,
            modules::administrador::admin_role_delete,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação Tauri");
}
