export class Struct {
	header: string = "";
	extracted: string[] = [];
	substructs: Struct[] = [];
	parent: Struct | null = null;
	headercount: number = 0;
}

export class QuoteOrComment {
	constructor(public item: string) { }
}