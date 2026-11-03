export const QUOTES: readonly string[] = [
    "The stars have watched a thousand worlds disappear. Tonight, they watch you.",
    "Nothing that shines is promised to shine forever.",
    "You crossed a desert to reach a stone. The journey was the thing that changed you.",
    "Even the oldest constellations are only temporary arrangements of light.",
    "The universe does not remember your footsteps. Walk anyway.",
    "One day, these stars will go dark. That does not make tonight less beautiful.",
    "You cannot return to the moment that brought you here. You can only begin again.",
    "The desert erases every path, but never the fact that someone walked it.",
    "Perhaps eternity is not lasting forever, but being here before it passes.",
    "Everything changes. Even this silence. Especially this silence."
];

export class QuoteBag {
    private bag: number[] = [];
    private lastIndex: number | null = null;

    constructor() {
        this.refillAndShuffle();
    }

    private refillAndShuffle(): void {
        const indices = QUOTES.map((_, idx) => idx);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = indices[i];
            indices[i] = indices[j];
            indices[j] = temp;
        }

        if (
            this.lastIndex !== null &&
            indices.length > 1 &&
            indices[indices.length - 1] === this.lastIndex
        ) {
            const swapIdx = Math.floor(Math.random() * (indices.length - 1));
            const temp = indices[indices.length - 1];
            indices[indices.length - 1] = indices[swapIdx];
            indices[swapIdx] = temp;
        }

        this.bag = indices;
    }

    public nextQuote(): string {
        if (this.bag.length === 0) {
            this.refillAndShuffle();
        }
        const nextIdx = this.bag.pop()!;
        this.lastIndex = nextIdx;
        return QUOTES[nextIdx];
    }
}