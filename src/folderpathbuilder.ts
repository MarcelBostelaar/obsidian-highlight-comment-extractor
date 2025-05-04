import { normalizePath } from "obsidian";

/**
	 * Processes path patterns with the following formats:
	 * {int} - Copy a single position path element
	 * {int:} - Copy all path elements from that position to the end
	 * {:int} - Copy all elements from the start until the specified position
	 * {int:int} - Copy all elements in that range
	 */
export function buildOutputPath(pattern: string, originalPath: string): string {
    const parts = normalizePath(originalPath).split("/");

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