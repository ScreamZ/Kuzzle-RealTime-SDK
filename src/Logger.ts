export class Logger {
	constructor(private isEnable: boolean) {}

	public log(...args: unknown[]) {
		if (this.isEnable) console.log(...args);
	}

	setEnable(enable: boolean) {
		this.isEnable = enable;
	}
}
