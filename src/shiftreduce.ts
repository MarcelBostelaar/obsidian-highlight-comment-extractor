export function tokenizeFor(token: string, list: string[]): any[] {
    return list.flatMap(line => {
        const split = line.split(token);
        return split.flatMap((part, i) => (i < split.length - 1 ? [part, token] : [part])).filter(x => x !== "");
    });
}

export function simpleShiftReduce(rules: any[], input: string[]): any[] {
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