import fetch from 'node-fetch';
import http from 'http';
import NodeCache from 'node-cache';

import { FanCurvePoint, FanCurve, HistoryStatOfOneServer, HistoryStat, CurrentLimitsOfOneServer, CurrentLimits, StaticInfoOfOneServer, StaticInfo } from 'zaychik-server-proto';
import { assert } from 'console';
import { BadRequestException } from '@nestjs/common';

import { backhome_protector } from './app';
import { BackhomeConsultResult, BackhomeVerdict } from 'zaychik-server-proto';


// Server: the abstracion (just a wrapper) of a server (zaychik-agent). It sends HTTP requests to the zaychik-agent
// to get data and set parameters.
class Server {
	host: string;
	port: number;
	http_agent: http.Agent;
	
	static_info: StaticInfoOfOneServer;
	current_limits: CurrentLimitsOfOneServer;

	constructor(host: string, port: number, fan_style: "asc" | "sc") {
		this.host = host;
		this.port = port;
		assert(fan_style == "asc" || fan_style == "sc");
		this.http_agent = new http.Agent({ keepAlive: true });
		// The following values will be overwritten by setup()
		this.static_info = {
			cpu_supported_clocks: [],
			num_cpu_cores: 0,
			gpu_supported_clocks: [],
			num_gpus: 0,
			num_fans: 0,
			fan_style: fan_style
		}
		this.current_limits = {
			cur_cpu_freq_limits: [],
			cur_gpu_freq_limit: 0,
			cur_fan_curves: []
		}
	}

	// Setup: set up basic infos, should be called immediately after the constructor.
	async setup() {
		// Get basic infos, including supported clocks and number of cores.
		await Promise.allSettled([
			this.send_http_request('cpu', 'GET', {})
				.then((json) => {
					this.static_info.cpu_supported_clocks = json.supported_clocks;
					this.static_info.num_cpu_cores = json.core_count;
					const max_cpu_clock = Math.max(...this.static_info.cpu_supported_clocks);
					this.current_limits.cur_cpu_freq_limits = Array(this.static_info.num_cpu_cores).fill(max_cpu_clock);
				}).catch((err) => {
					console.log(`Failed to get CPU supported clocks: ${err}`);
					process.exit(1);
				}),
			this.send_http_request('gpu', 'GET', {})
				.then((json) => {
					this.static_info.gpu_supported_clocks = json.supported_clocks;
					this.static_info.num_gpus = json.powers.length;
					if (this.static_info.num_gpus !== 0) {
						this.current_limits.cur_gpu_freq_limit = Math.max(...this.static_info.gpu_supported_clocks);
					} else {
						this.current_limits.cur_gpu_freq_limit = 0;
					}
				}).catch((err) => {
					console.log(`Failed to get GPU supported clocks: ${err}`);
					process.exit(1);
				}),
			this.send_http_request('fan', 'GET', {})
				.then((json) => {
					this.static_info.num_fans = json.speeds.length;
				}).catch((err) => {
					console.log(`Failed to get fan curves: ${err}`);
					process.exit(1);
				}),
		])
		// Set hardware to their default
		// default: CPU at full speed, GPU at lowest speed, fan at 60% speed
		const default_fan_curve: FanCurve = this.static_info.fan_style == "asc" ? 
			[
				{"temp": 10, "speed": 60},
				{"temp": 20, "speed": 60},
				{"temp": 40, "speed": 60},
				{"temp": 60, "speed": 60},
				{"temp": 100, "speed": 60},
			] : [
				{"temp": 30, "speed": 30},
				{"temp": 60, "speed": 40},
				{"temp": 80, "speed": 60},
				{"temp": 90, "speed": 65},
				{"temp": 100, "speed": 65},
			];
		await Promise.all([
			this.set_cpu_max_clock(Array(this.static_info.num_cpu_cores).fill(Math.max(...this.static_info.cpu_supported_clocks))),
			this.set_gpu_clock(Math.min(10000, ...this.static_info.gpu_supported_clocks)),
			this.set_all_fan_curves(default_fan_curve)
		]).catch((err) => {
			console.log(`Failed to set hardware to default: ${err}. Exiting...`);
			process.exit(1);
		});
	}
	
	// send_http_request: Send a request to an API on the zaychik-agent. Accept
	// a json object as the body of the request, and return a json object as the
	// response.
	// When encountering an error, throw an exception.
	async send_http_request(path: string, method: string, body: any): Promise<any> {
		const response = await fetch(`http://${this.host}:${this.port}/${path}`, {
			method: method,
			agent: this.http_agent,
			body: method == 'PUT' || method == 'POST' ? JSON.stringify(body) : undefined,
			headers: {
				"Content-Type": "application/json",
			},
		});
		if (response.status != 200) {
			const msg = `Failed to send HTTP request to ${this.host}:${this.port}/${path},
	status code: ${response.status},
	status text: ${response.statusText},
	response body: ${await response.text()}`;
			console.log(msg);
			throw new Error(msg);
		}
		const json = await response.json();
		return json;
	}

	async get_cpu_power(): Promise<number> {
		return await this.send_http_request('cpu', 'GET', {})
			.then((json) => {
				return json.power;
			}
		);
	}

	async set_cpu_max_clock(clocks: number[]): Promise<void> {
		await this.send_http_request('cpu', 'PUT', { clocks: clocks });
		this.current_limits.cur_cpu_freq_limits = clocks;
	}

	async reset_cpu_clock(): Promise<void> {
		await this.send_http_request('cpu', 'DELETE', {});
	}

	async get_gpu_powers(): Promise<Array<number>> {
		if (this.static_info.num_gpus === 0) {
			return [];
		}
		return await this.send_http_request('gpu', 'GET', {})
			.then((json) => {
				return json.powers;
			}
		);
	}

	async set_gpu_clock(clock: number): Promise<void> {
		await this.send_http_request('gpu', 'PUT', { clock: clock });
		this.current_limits.cur_gpu_freq_limit = clock;
	}

	async reset_gpu_clock(): Promise<void> {
		await this.send_http_request('gpu', 'DELETE', {});
	}
	
	async get_one_fan_speed(fan_id: number): Promise<number> {
		return await this.send_http_request(`fan/${fan_id}`, 'GET', {})
			.then((json) => {
				return json.speed;
			}
		);
	}

	async get_all_fan_speeds(): Promise<Array<number>> {
		return await this.send_http_request('fan', 'GET', {})
			.then((json) => {
				return json.speeds;
			}
		);
	}

	async set_one_fan_curve(fan_id: number, curve: FanCurve): Promise<void> {
		await this.send_http_request(`fan/${fan_id}`, 'PUT', { curve: curve });
		this.current_limits.cur_fan_curves[fan_id] = curve;
	}

	async set_all_fan_curves(curve: FanCurve): Promise<void> {
		await this.send_http_request('fan', 'PUT', { curve: curve });
		this.current_limits.cur_fan_curves = Array(this.static_info.num_fans).fill(curve);
	}

	async get_node_power(): Promise<number> {
		return await this.send_http_request('node', 'GET', {})
			.then((json) => {
				return json.power;
			}
		);
	}
}

// refresh_certain_key: If the key is not in the cache, call getter() to
// get the value, and set the value in the cache.
async function refresh_certain_key(cache: NodeCache, key_name: string, ttl: number, getter: () => Promise<any>): Promise<any> {
	let result = cache.get(key_name);
	if (result == undefined) {
		result = await getter();
		cache.set(key_name, result, ttl);
	}
	return result;
}

// Cluster: the abstraction of a cluster. It contains a list of servers, and
// sends HTTP requests to the zaychik-agent on each server to get data and set
// parameters.
// When getting history_stats, it consults XXX_refresh_interval to decide whether
// to send a request to the zaychik-agent or use the cached data. This is mainly
// because that IPMI is slow, and we don't want to send too many requests to the
// zaychik-agent. So for hardware like Fans that costs a lot of IPMI requests,
// we use a longer refresh interval.
class Cluster {
	cpu_refresh_interval: number;
	gpu_refresh_interval: number;
	fan_refresh_interval: number;
	node_refresh_interval: number;

	servers: Array<Server>;

	// Each server has a cache.
	caches: Array<NodeCache> = [];
	
	constructor(
		cluster_config: any,
		logging_config: any) {
		this.cpu_refresh_interval = logging_config["cpu_refresh_interval"];
		this.gpu_refresh_interval = logging_config["gpu_refresh_interval"];
		this.fan_refresh_interval = logging_config["fan_refresh_interval"];
		this.node_refresh_interval = logging_config["node_refresh_interval"];

		this.servers = [];
		for (let server_config of cluster_config["servers"]) {
			let new_server = new Server(
				server_config["host"],
				server_config["port"],
				server_config["fan_style"]
			);
			this.servers.push(new_server);
			this.caches.push(new NodeCache({
				checkperiod: 0.2,
				deleteOnExpire: true,
			}));
		}

	}

	// setup: set up basic infos, should be called immediately after the constructor.
	async setup() {
		let handlers = [];
		for (let server of this.servers) {
			handlers.push(server.setup());
		}
		await Promise.all(handlers);
	}

	async get_history_stat_with_cache(): Promise<HistoryStat> {
		let _this = this;
		async function get_history_stat_of_one_server(server_id: number): Promise<HistoryStatOfOneServer> {
			let my_server = _this.servers[server_id];
			let my_cache = _this.caches[server_id];

			let cpu_power_promise = refresh_certain_key(my_cache, 'cpu_power', _this.cpu_refresh_interval, () => {
				return my_server.get_cpu_power();
			});
			let gpu_power_promise = refresh_certain_key(my_cache, 'gpu_powers', _this.gpu_refresh_interval, () => {
				return my_server.get_gpu_powers();
			});
			let fan_speeds_promise = refresh_certain_key(my_cache, 'fan_speeds', _this.fan_refresh_interval, () => {
				return my_server.get_all_fan_speeds();
			});
			let node_power_promise = refresh_certain_key(my_cache, 'node_power', _this.node_refresh_interval, () => {
				return my_server.get_node_power();
			});
			return {
				cpu_power: await cpu_power_promise,
				gpu_powers: await gpu_power_promise,
				fan_speeds: await fan_speeds_promise,
				node_power: await node_power_promise,
			};
		}
		
		let history_stat_promises = [];
		for (let server_id = 0; server_id < this.servers.length; server_id++) {
			history_stat_promises.push(get_history_stat_of_one_server(server_id));
		}

		let history_stat = await Promise.all(history_stat_promises);
		return {
			nodes: history_stat,
		}
	}

	// brake - This function is called when the "brake" module detects that the
	// total power consumption of the cluster exceeds the threshold. It sets all
	// the servers to their minimum clock.
	async brake(): Promise<void> {
		const minimum_fan_curve: FanCurve = [
			{temp: 40, speed: 30},
			{temp: 70, speed: 30},
			{temp: 85, speed: 30},
			{temp: 90, speed: 30},
			{temp: 100, speed: 30}
		];
		let handlers: Array<Promise<void>> = [];
		for (let server of this.servers) {
			handlers.push((async () => {
				// If one of the promises in the array rejects, Promise.all()
				// immediately rejects the returned promise and aborts the
				// other operations. This may cause unexpected state or behavior.
				// Promise.allSettled() is another composition tool that ensures
				// all operations are complete before resolving.
				Promise.allSettled([
					(async () => {
						const min_cpu_clock = Math.min(...server.static_info.cpu_supported_clocks);
						await server.set_cpu_max_clock(Array(server.static_info.num_cpu_cores).fill(min_cpu_clock));
					})(),
					(async () => {
						if (server.static_info.num_gpus !== 0) {
							let min_gpu_clock = Math.min(...server.static_info.gpu_supported_clocks);
							await server.set_gpu_clock(min_gpu_clock);
						}
					})(),
					(async () => {
						server.set_all_fan_curves(minimum_fan_curve);
					})()
				]);
			})());
		}
		await Promise.all(handlers);
	}

	get_current_limits(): CurrentLimits {
		const result: CurrentLimits = {
			nodes: []
		};
		for (let server of this.servers) {
			result.nodes.push(server.current_limits);
		}
		return result;
	}

	get_static_info(): StaticInfo {
		const result: StaticInfo = {
			nodes: []
		};
		for (let server of this.servers) {
			result.nodes.push(server.static_info);
		}
		return result;
	}

	async set_cpu_clocks(clocks: number[][], is_confirmed_to_warning: boolean): Promise<BackhomeConsultResult> {
		const static_info = this.get_static_info();
		const num_nodes = static_info.nodes.length;

		// Validation
    	if (clocks.length !== num_nodes) {
			throw new BadRequestException(`Wrong number of nodes: ${static_info.nodes.length} expected, ${num_nodes} given`);
		}
		for (let index = 0; index < num_nodes; index += 1) {
			const cur_node_clocks = clocks[index];
			if (cur_node_clocks.length !== static_info.nodes[index].num_cpu_cores) {
				throw new BadRequestException(`Wrong number of cores: ${static_info.nodes[index].num_cpu_cores} expected, ${cur_node_clocks.length} given`);
			}
			for (let clock of cur_node_clocks) {
				if (!static_info.nodes[index].cpu_supported_clocks.includes(clock)) {
					throw new BadRequestException(`Unsupported clock: ${clock}`);
				}
			}
		}

		// Backhome checking
		let new_limits = structuredClone(this.get_current_limits());
		new_limits.nodes = new_limits.nodes.map((x, index) => {
			x.cur_cpu_freq_limits = clocks[index];
			return x;
		});
		let consult_result = await backhome_protector.consult(static_info, new_limits, is_confirmed_to_warning);
		
		// Apply
		let promises = [];
		for (let index = 0; index < num_nodes; index += 1) {
			promises.push(this.servers[index].set_cpu_max_clock(clocks[index]));
		}
		await Promise.all(promises).catch((err) => {
			console.log(`Failed to set CPU clocks: ${err}`);
			throw err;
		});

		return consult_result;
	}

	async set_gpu_clocks(clocks: (number | null)[], is_confirmed_to_warning: boolean) {
		const static_info = this.get_static_info();
		const num_nodes = static_info.nodes.length;

		// Validation
		if (clocks.length !== num_nodes) {
			throw new BadRequestException(`Wrong number of nodes: ${static_info.nodes.length} expected, ${num_nodes} given`);
		}
		for (let index = 0; index < num_nodes; index += 1) {
			if (static_info.nodes[index].num_gpus !== 0 && !static_info.nodes[index].gpu_supported_clocks.includes(clocks[index])) {
				throw new BadRequestException(`Unsupported clock: ${clocks[index]}`);
			}
		}
		
		// Backhome checking
		let new_limits = structuredClone(this.get_current_limits());
		new_limits.nodes = new_limits.nodes.map((x, index) => {
			x.cur_gpu_freq_limit = clocks[index];
			return x;
		});
		let consult_result = await backhome_protector.consult(static_info, new_limits, is_confirmed_to_warning);

		let promises = [];
		for (let index = 0; index < num_nodes; index += 1) {
			promises.push(this.servers[index].set_gpu_clock(clocks[index]));
		}
		await Promise.all(promises).catch((err) => {
			console.log(`Failed to set GPU clocks: ${err}`);
			throw err;
		});

		return consult_result;
	}

	async set_fan_speeds(speeds: FanCurve[][], is_confirmed_to_warning: boolean) {
		const static_info = this.get_static_info();
		const num_nodes = static_info.nodes.length;

		// Validation
		if (speeds.length !== num_nodes) {
			throw new BadRequestException(`Wrong number of nodes: ${static_info.nodes.length} expected, ${num_nodes} given`);
		}
		for (let index = 0; index < num_nodes; index += 1) {
			const cur_node_speeds = speeds[index];
			if (cur_node_speeds.length !== static_info.nodes[index].num_fans) {
				throw new BadRequestException(`Wrong number of fans: ${static_info.nodes[index].num_fans} expected, ${cur_node_speeds.length} given`);
			}
			for (let fan_curve of cur_node_speeds) {
				let previous_speed = 0;
				let previous_temp = 0;
				for (let point of fan_curve) {
					if (point.speed < 0 || point.speed > 100) {
						throw new BadRequestException(`Invalid speed: ${point.speed}`);
					}
					if (point.temp < 0 || point.temp > 100) {
						throw new BadRequestException(`Invalid temperature: ${point.temp}`);
					}
					if (point.speed < previous_speed) {
						throw new BadRequestException(`Invalid fan curve (speed is not monotonous): ${fan_curve}`);
					}
					if (point.temp < previous_temp) {
						throw new BadRequestException(`Invalid fan curve (temperature is not monotonous): ${fan_curve}`);
					}
				}
			}
		}

		// Backhome checking
		let new_limits = structuredClone(this.get_current_limits());
		new_limits.nodes = new_limits.nodes.map((x, index) => {
			x.cur_fan_curves = speeds[index];
			return x;
		});
		let consult_result = await backhome_protector.consult(static_info, new_limits, is_confirmed_to_warning);

		// Apply
		let promises = [];
		for (let node_index = 0; node_index < num_nodes; node_index += 1) {
			for (let fan_index = 0; fan_index < static_info.nodes[node_index].num_fans; fan_index += 1) {
				promises.push(this.servers[node_index].set_one_fan_curve(fan_index, speeds[node_index][fan_index]));
			}
		}
		await Promise.all(promises).catch((err) => {
			console.log(`Failed to set fan speeds: ${err}`);
			throw err;
		});

		return consult_result;
	}
}

export { Server, Cluster };
