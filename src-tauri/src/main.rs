// 发布版 Windows 隐藏额外控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vibe_flow_lib::run();
}
