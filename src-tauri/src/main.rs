// Evita abrir um console extra no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    interno_uplab_lib::run()
}
