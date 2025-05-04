import {
	App,
	FuzzySuggestModal,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	TFolder,
	normalizePath
} from "obsidian";
import { simpleShiftReduce, tokenizeFor } from "src/shiftreduce";
import { ExtractSettingTab } from "./settings";
import { FolderSelectModal } from "./folderpicker";
import { buildOutputPath } from "./folderpathbuilder";

class Struct {
	header: string = "";
	lines: string[] = [];
	extracted: string[] = [];
	substructs: Struct[] = [];
	parent: Struct | null = null;
	headercount: number = 0;
}

class QuoteOrComment {
	constructor(public item: string) { }
}

interface PluginSettings {
	pathPattern: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	pathPattern: "Extract/{2:}",
};

// ========== Main Plugin ==========
export default class ExtractPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

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

		this.addCommand({
			id: "process-folder",
			name: "Process Folder...",
			callback: () => {
				new FolderSelectModal(this.app, async (folder) => {
					for (const f of folder.children) {
						if (f instanceof TFile && f.extension === "md") {
							await this.processFile(f);
						}
					}
					new Notice("Folder processed");
				}).open();
			},
		});

		this.addSettingTab(new ExtractSettingTab(this.app, this));
	}

	async processFile(file: TFile) {
		const content = await this.app.vault.read(file);
		const lines = content.split("\n");

		const structs: Struct[] = [];
		let current: Struct = new Struct();

		for (const line of lines) {
			if (line.startsWith("#")) {
				structs.push(current);
				current = new Struct();
				current.header = line.replace(/(==|%%)/g, "").trim();
				current.headercount = (current.header.match(/^#+/) || [""])[0].length;
			}
			current.lines.push(line);

			let tokens: any[] = [line];
			tokens = tokenizeFor("==", tokens);
			tokens = tokenizeFor("%%", tokens);

			const result = simpleShiftReduce([
				{
					test: ["==", "str", "=="],
					process: (x: any[]) => [new QuoteOrComment("> " + x[1].trim())],
				},
				{
					test: ["%%", "str", "%%"],
					process: (x: any[]) => [new QuoteOrComment(x[1].trim())],
				},
			], tokens);

			const extracted = result.filter(x => x instanceof QuoteOrComment).map((q: QuoteOrComment) => q.item);
			current.extracted.push(...extracted);
		}

		structs.push(current);

		// Tree structuring
		const root = new Struct();
		root.headercount = -1;
		let cursor = root;
		for (const s of structs) {
			while (cursor.headercount >= s.headercount){ 
				cursor = cursor.parent!
			};
			cursor.substructs.push(s);
			s.parent = cursor;
			cursor = s;
		}

		const output = this.outputCitationNote(root, file.basename).join("\n\n");

		// Path construction
		const filePath = file.path;
		const newPath = buildOutputPath(this.settings.pathPattern, filePath);
		await this.app.vault.adapter.mkdir(normalizePath(newPath.split("/").slice(0, -1).join("/")));
		await this.app.vault.adapter.write(normalizePath(newPath), output);
		new Notice(`Processed: ${file.name}`);
	}

	outputCitationNote(struct: Struct, original: string): string[] {
		let out: string[] = [];
		if (struct.extracted.length > 0) {
			out.push(struct.header);
			const path = this.reverseHeaders(struct).join("");
			out.push(`[[${original}${path}]]`);
			out.push(...struct.extracted);
		}
		for (const child of struct.substructs) {
			out.push(...this.outputCitationNote(child, original));
		}
		return out;
	}

	reverseHeaders(s: Struct | null): string[] {
		if (!s || s.header === "") return [];
		return Array.combine([this.reverseHeaders(s.parent), [s.header.replace("# ", "#")]]);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}



