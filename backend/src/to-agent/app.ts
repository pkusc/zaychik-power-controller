import { readFile } from "fs/promises"

import { Server, Cluster } from "./hw_interface"
import { insertHistoryStat } from "./database"
import { BackhomeProtector } from "./backhome"

export let cluster: Cluster | null = null;
export let backhome_protector: BackhomeProtector

export async function to_agent_main() {
	// Read config from config.json
	let config = await readFile("./config.json").then(data => JSON.parse(data.toString()));
	console.log("Server starting with cluster config:\n" + JSON.stringify(config, null, "    "));

	// Create backhome protector
	backhome_protector = new BackhomeProtector(config["backhome"]);
	
	// Create cluster
	cluster = new Cluster(
		config["cluster"],
		config["logging"]
	);

	await cluster.setup();

	console.log("Cluster setup done:", cluster.servers);

	console.log(await cluster.get_history_stat_with_cache());

	// Logger
	// Start a function that logs the cluster stats to the database
	async function logger_main() {
		let history_stats = await cluster.get_history_stat_with_cache();
		// console.info(JSON.stringify(history_stats, null, "  "));
		insertHistoryStat(history_stats);
		setTimeout(logger_main, config["logging"]["log_interval"]*1000);
	}
	logger_main();

	// Brake
	// Start a function that checks the power consumption of the cluster periodically
	// and brake the cluster (set all hw to their minimum freq) if the power consumption
	// is too high
	async function brake_main() {
		let total_power_consumption = 0;
		if (total_power_consumption > config["brake"]["threshold"]) {
			console.warn(`Power consumption (${total_power_consumption} W) is higher than threshold (${config["brake"]["threshold"]} W), braking the cluster.`);
			cluster.brake();
		}
		setTimeout(brake_main, config["brake"]["check_interval"]*1000);
	}
	brake_main();
}
