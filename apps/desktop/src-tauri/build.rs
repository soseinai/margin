fn main() {
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/Assets.car");
    println!("cargo:rerun-if-changed=icons/icon.icon/icon.json");
    println!("cargo:rerun-if-changed=icons/icon.icon/Assets/Letter.svg");
    println!("cargo:rerun-if-changed=Info.plist");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
