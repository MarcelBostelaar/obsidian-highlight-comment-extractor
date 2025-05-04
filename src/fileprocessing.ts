import { QuoteOrComment, Struct } from "./classes";
import { simpleShiftReduce, tokenizeFor } from "./shiftreduce";

/**
 * Parses the content of a file into a list of Struct objects, which contain headers and extracted comments/quotes.
 * @param content - The content of the file to parse
 * @returns An array of Struct objects representing the parsed content
 */
export function parseFileContent(content: string): Struct[] {
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
    return structs;
}

/**
 * Builds a tree structure from an array of Struct objects based on their header counts.
 * @param structs - An array of Struct objects to build a tree from
 * @returns A root Struct object representing the top of the tree
 */
export function buildStructTree(structs: Struct[]): Struct {
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
    return root;
}

/**
 * Outputs a citation note for a given completed tree root Struct object and its original file name. Embeds links to the original file and its headers.
 * @param struct - The root Struct object representing the completed tree
 * @param fullPath - The original file path
 * @param basename - The original file name without the extension
 * @returns An array of strings representing the citation note
 */
export function outputCitationNote(struct: Struct, fullPath: string, basename: string): string[] {
    let out: string[] = [];
    if (struct.extracted.length > 0) {
        out.push(struct.header);
        const path = reverseHeaders(struct).join("");
        out.push(`[[${fullPath}${path}|${basename}]]`);
        out.push(...struct.extracted);
    }
    for (const child of struct.substructs) {
        out.push(...outputCitationNote(child, fullPath, basename));
    }

    // Remove empty strings from the beginning of the output array
    while( out.length > 0 && out[0] === "") {
        out.shift();
    }
    return out;
}

/**
 * Reverses the headers of a Struct object to create a wiki path-like string representation.
 * @param s - The Struct object to reverse headers for
 * @returns An array of strings representing the reversed headers, in wikilink format
 */
function reverseHeaders(struct: Struct | null): string[] {
    if (!struct || struct.header === "") return [];
    return Array.combine([reverseHeaders(struct.parent), [struct.header.replace("# ", "#")]]);
}