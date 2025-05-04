import {
	App,
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

interface Struct {
	header: string;
	lines: string[];
	extracted: string[];
	substructs: Struct[];
	parent: Struct | null;
	headercount: number;
}

class QuoteOrComment {
	constructor(public item: string) { }
}

interface PluginSettings {
	pathPattern: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	pathPattern: "Extract/{2:n}",
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
		let current: Struct = this.newStruct();

		for (const line of lines) {
			if (line.startsWith("#")) {
				if (current.header !== "") structs.push(current);
				current = this.newStruct();
				current.header = line.replace(/(==|%%)/g, "").trim();
				current.headercount = (current.header.match(/^#+/) || [""])[0].length;
			}
			current.lines.push(line);

			let tokens: any[] = [line];
			tokens = this.tokenizeFor("==", tokens);
			tokens = this.tokenizeFor("%%", tokens);

			const result = this.simpleShiftReduce([
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
		const root = this.newStruct();
		root.headercount = -1;
		let cursor = root;
		for (const s of structs) {
			while (cursor.headercount >= s.headercount) cursor = cursor.parent!;
			cursor.substructs.push(s);
			s.parent = cursor;
			cursor = s;
		}

		const output = this.outputCitationNote(root, file.basename).join("\n\n");

		// Path construction
		const filePath = file.path;
		const newPath = this.buildOutputPath(filePath);
		await this.app.vault.adapter.mkdir(normalizePath(newPath.split("/").slice(0, -1).join("/")));
		await this.app.vault.adapter.write(normalizePath(newPath), output);
		new Notice(`Processed: ${file.name}`);
	}

	/**
	 * Processes path patterns with the following formats:
	 * {int} - Copy a single position path element
	 * {int:} - Copy all path elements from that position to the end
	 * {:int} - Copy all elements from the start until the specified position
	 * {int:int} - Copy all elements in that range
	 */
	processPathPattern(pattern: string, parts: string[]): string {
		return pattern.replace(/\{(\d+)?(:(\d+)?)?\}/g, (match, startStr, colonPart, endStr) => {
			// Parse indices (convert to 0-based)
			const hasStart = startStr !== undefined;
			const hasEnd = endStr !== undefined;
			const start = hasStart ? parseInt(startStr) - 1 : 0;
			const end = hasEnd ? parseInt(endStr) - 1 : parts.length;

			// Handle the different pattern types
			if (hasStart && !colonPart) {
				// Case: {int} - single element
				return start < parts.length ? parts[start] : "";
			} else {
				// Cases: {int:int}, {int:}, {:int}, {:}
				return parts.slice(start, end + 1).join("/");
			}
		});
	}

	buildOutputPath(originalPath: string): string {
		const parts = normalizePath(originalPath).split("/");
		const pattern = this.settings.pathPattern;
		const filename = parts[parts.length - 1].replace(/\.md$/, "");

		// Process the pattern to get the directory part
		let directory = this.processPathPattern(pattern, parts);
		return directory;
	}

	newStruct(): Struct {
		return { header: "", lines: [], extracted: [], substructs: [], parent: null, headercount: 0 };
	}

	tokenizeFor(token: string, list: string[]): any[] {
		return list.flatMap(line => {
			const split = line.split(token);
			return split.flatMap((part, i) => (i < split.length - 1 ? [part, token] : [part])).filter(x => x !== "");
		});
	}

	simpleShiftReduce(rules: any[], input: string[]): any[] {
		let stack: any[] = [];
		while (input.length > 0) {
			stack.push(input.shift());
			for (const rule of rules) {
				const test = rule.test;
				if (stack.length >= test.length) {
					const segment = stack.slice(-test.length);
					let matched = true;
					for (let i = 0; i < test.length; i++) {
						if (test[i] === "str" && typeof segment[i] !== "string") matched = false;
						else if (typeof test[i] === "string" && test[i] !== "str" && segment[i] !== test[i]) matched = false;
					}
					if (matched) {
						stack.splice(-test.length, test.length, ...rule.process(segment));
						break;
					}
				}
			}
		}
		return stack;
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

// ========== Settings ==========
class ExtractSettingTab extends PluginSettingTab {
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

// ========== Folder Picker Modal ==========
class FolderSelectModal extends Modal {
	constructor(app: App, private onSelect: (folder: TFolder) => void) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Select Folder" });

		const folders: TFolder[] = [];
		const gather = (item: TAbstractFile) => {
			if (item instanceof TFolder) {
				folders.push(item);
				item.children.forEach(gather);
			}
		};
		gather(this.app.vault.getRoot());

		for (const folder of folders) {
			const btn = contentEl.createEl("button", { text: folder.path });
			btn.onclick = () => {
				this.close();
				this.onSelect(folder);
			};
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
