import {
	Notice,
	Plugin,
	TFile,
	TFolder,
	normalizePath
} from "obsidian";
import { DEFAULT_SETTINGS, ExtractSettingTab, PluginSettings } from "./settings";
import { FolderSelectModal } from "./folderpicker";
import { buildOutputPath } from "./folderpathbuilder";
import { buildStructTree, outputCitationNote, parseFileContent } from "./fileprocessing";
import { Struct } from "./classes";

export default class ExtractPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// Command to process the currently open file
		this.addCommand({
			id: "process-current-file",
			name: "Process Current File",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (file && !checking) {
					this.processFile(file);
				}
				return !!file;
			},
		});

		// Command to process all files in a selected folder
		this.addCommand({
			id: "process-folder",
			name: "Process Folder...",
			callback: () => {
				new FolderSelectModal(this.app, x => this.processFolder(x, true)).open();
			},
		});

		this.addSettingTab(new ExtractSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async processFolder(folder: TFolder, topLevel: boolean = false) {
		for (const f of folder.children) {
			if (f instanceof TFile && f.extension === "md") {
				await this.processFile(f);
			}
			if (f instanceof TFolder) {
				await this.processFolder(f);
			}
		}
		if (topLevel) {
			new Notice("Folder processed");
		}
	}

	/**
	 * Processes a file by reading its content, parsing it into structures, and generating an output file.
	 * @param file - The file to process
	 */
	private async processFile(file: TFile) {
		const content = await this.app.vault.read(file);
		const structs = parseFileContent(content);
		const root = buildStructTree(structs);
		await this.generateAndSaveOutput(root, file);
		new Notice(`Processed: ${file.name}`);
	}

	/**
	 * Generates an output file based on the parsed structures and saves it to the specified path.
	 * @param root - The root structure of the parsed content
	 * @param file - The original file being processed
	 */
	private async generateAndSaveOutput(root: Struct, file: TFile) {
		const output = outputCitationNote(root, file.path, file.basename).join("\n\n");
		
		// Path construction
		const filePath = file.path;
		const newPath = buildOutputPath(this.settings.pathPattern, filePath);
		await this.app.vault.adapter.mkdir(normalizePath(newPath.split("/").slice(0, -1).join("/")));
		await this.app.vault.adapter.write(normalizePath(newPath), output);
	}
}



