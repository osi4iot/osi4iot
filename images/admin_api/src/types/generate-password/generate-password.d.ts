declare module "generate-password" {
	interface GenerateOptions {
		length?: number;
		numbers?: boolean;
		symbols?: boolean;
		uppercase?: boolean;
		lowercase?: boolean;
		excludeSimilarCharacters?: boolean;
		exclude?: string;
		strict?: boolean;
	}

	function generate(options?: GenerateOptions): string;
	function generateMultiple(amount: number, options?: GenerateOptions): string[];

	export { generate, generateMultiple };
}
