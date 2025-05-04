// ========== Settings ==========

import { App, PluginSettingTab, Setting } from "obsidian";
import ExtractPlugin from "./main";

export interface PluginSettings {
    pathPattern: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    pathPattern: "Extract/{2:}",
};

export class ExtractSettingTab extends PluginSettingTab {

    constructor(app: App, private plugin: ExtractPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Extract Plugin Settings" });

        new Setting(containerEl)
            .setName("Path Pattern")
            .setDesc("Use brackets like {2:}, {3}, {:3} or {3:6} to copy the path slice. Select a range by specifying (1 indexed) elements of the path and the : to specify a range. Leave a range open ended to copy the range from the start or until the end.")
            .addText(text => text
                .setPlaceholder("Extract/{2:}")
                .setValue(this.plugin.settings.pathPattern)
                .onChange(async value => {
                    this.plugin.settings.pathPattern = value;
                    await this.plugin.saveSettings();
                }));
    }
}