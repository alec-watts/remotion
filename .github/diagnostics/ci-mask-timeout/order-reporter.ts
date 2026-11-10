import {appendFileSync} from 'node:fs';
import type {Reporter, TestCase, TestModule} from 'vitest/node';

export default class MaskOrderReporter implements Reporter {
	constructor(private readonly output: string) {}
	private record(event: string, details: Record<string, unknown>) {
		appendFileSync(
			this.output,
			JSON.stringify({
				event,
				wall: Date.now(),
				monotonic: performance.now(),
				...details,
			}) + '\n',
		);
	}
	onTestModuleStart(module: TestModule) {
		this.record('module:start', {
			project: module.project.name,
			file: module.relativeModuleId,
		});
	}
	onTestModuleEnd(module: TestModule) {
		this.record('module:end', {
			project: module.project.name,
			file: module.relativeModuleId,
			state: module.state(),
		});
	}
	onTestCaseReady(test: TestCase) {
		this.record('test:start', {
			id: test.id,
			project: test.project.name,
			file: test.module.relativeModuleId,
			name: test.fullName,
		});
	}
	onTestCaseResult(test: TestCase) {
		this.record('test:end', {
			id: test.id,
			project: test.project.name,
			file: test.module.relativeModuleId,
			name: test.fullName,
			result: test.result(),
			diagnostic: test.diagnostic(),
		});
	}
	onTestRunEnd: NonNullable<Reporter['onTestRunEnd']> = (
		modules,
		unhandled,
		reason,
	) => {
		this.record('run:end', {
			reason,
			unhandledErrors: unhandled,
			modules: modules.map((module) => ({
				project: module.project.name,
				file: module.relativeModuleId,
				state: module.state(),
				cases: Array.from(module.children.allTests(), (test) => ({
					id: test.id,
					name: test.fullName,
					state: test.result().state,
				})),
			})),
		});
	};

	onUserConsoleLog(
		log: Parameters<NonNullable<Reporter['onUserConsoleLog']>>[0],
	) {
		if (log.content.includes('MASK_TIMEOUT_'))
			this.record('browser:observation', {
				content: log.content,
				taskId: log.taskId,
			});
	}
}
