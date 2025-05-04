import { App, FuzzySuggestModal, TAbstractFile, TFolder } from "obsidian";

/**
 * A modal for selecting a folder in the vault.
 */
export class FolderSelectModal extends FuzzySuggestModal<TFolder> {

	constructor(app: App, private onSelect: (folder: TFolder) => void) {
		super(app);
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		const gather = (item: TAbstractFile) => {
			if (item instanceof TFolder) {
				folders.push(item);
				item.children.forEach(gather);
			}
		};
		gather(this.app.vault.getRoot());
		return folders;
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
		this.onSelect(folder);
	}
}
