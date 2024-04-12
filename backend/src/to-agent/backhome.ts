import { BadRequestException } from "@nestjs/common";

import { FanCurvePoint, FanCurve, StaticInfo, CurrentLimits, CurrentLimitsOfOneServer, BackhomeVerdict, BackhomeConsultResult } from "zaychik-server-proto";

type ReferenceList = {
	metric: number,
	power: number
}[];

export class BackhomeProtector {
	cpu_power_per_core: ReferenceList
	gpu_power_per_card: ReferenceList
	fan_power_per_fan: ReferenceList

	base_power_of_all_nodes: number
	warn_threshold: number
	notallowed_threshold: number

	constructor(backhome_config: any) {
		this.cpu_power_per_core = backhome_config.cpu_power_per_core.map((x) => {
			return {"metric": x.clock, "power": x.power}
		})
		this.gpu_power_per_card = backhome_config.gpu_power_per_card.map((x) => {
			return {"metric": x.clock, "power": x.power}
		})
		this.fan_power_per_fan = backhome_config.fan_power_per_fan.map((x) => {
			return {"metric": x.speed, "power": x.power}
		})
		this.base_power_of_all_nodes = backhome_config.base_power_of_all_nodes
		this.warn_threshold = backhome_config.warn_threshold
		this.notallowed_threshold = backhome_config.notallowed_threshold
		if (!this.base_power_of_all_nodes || !this.warn_threshold || !this.notallowed_threshold) {
			throw new Error(`base_power_of_all_nodes, warn_threshold and notallowed_threshold must be specified in backhome config`)
		}
	}

	private get_power(metric: number, reference_list: ReferenceList) {
		// Return the first point in reference_list with metric >= given metric
		for (let i = 0; i < reference_list.length; i++) {
			if (reference_list[i].metric >= metric) {
				return reference_list[i].power
			}
		}
		// If metric is greater than the last metric in reference_list, return the last power
		console.warn(`All points in reference_list have metric < given metric. We have to return the
		largest power in the reference list. I will never go, there's a way back home!
		reference_list: ${JSON.stringify(reference_list)}
		given metric: ${metric}`)
		return reference_list[reference_list.length - 1].power
	}

	private consultRaw(cpu_clock_limits: number[], gpu_clock_limits: (number | null)[], fan_speed_limits: number[]):
		BackhomeConsultResult {
		let total_max_power = this.base_power_of_all_nodes
		for (let clock of cpu_clock_limits) {
			total_max_power += this.get_power(clock, this.cpu_power_per_core)
		}
		for (let clock of gpu_clock_limits) {
			if (clock === null) {
				continue
			}
			total_max_power += this.get_power(clock, this.gpu_power_per_card)
		}
		for (let speed of fan_speed_limits) {
			total_max_power += this.get_power(speed, this.fan_power_per_fan)
		}
		let verdict = BackhomeVerdict.OK
		if (total_max_power > this.warn_threshold) {
			verdict = BackhomeVerdict.WARN
		}
		if (total_max_power > this.notallowed_threshold) {
			verdict = BackhomeVerdict.NOTALLOWED
		}
		return {total_max_power, verdict}
	}

	consult(static_infos: StaticInfo, current_limits: CurrentLimits, is_confimed: boolean):
		BackhomeConsultResult {
		const cpu_clock_limits = current_limits.nodes
			.map((x: CurrentLimitsOfOneServer) => x.cur_cpu_freq_limits)
			.flat()
		const gpu_clock_limits = current_limits.nodes
			.map((x: CurrentLimitsOfOneServer, node_index) => 
				Array(static_infos.nodes[node_index].num_gpus)
					.fill(x.cur_gpu_freq_limit))
			.flat()
		const fan_speed_limits = current_limits.nodes
			.map((x: CurrentLimitsOfOneServer, node_index) =>
				x.cur_fan_curves.map((y: FanCurve) => 
					Math.max(...y.map((z: FanCurvePoint) => z.speed))))
			.flat();
		const result = this.consultRaw(cpu_clock_limits, gpu_clock_limits, fan_speed_limits)
		if (result.verdict === BackhomeVerdict.NOTALLOWED) {
			throw new BadRequestException(`Backhome protector does not allow this operation. This operation may cause the power consumption to ${result.total_max_power} W while the limit is ${this.notallowed_threshold} W`);
		}
		if (result.verdict === BackhomeVerdict.WARN) {
			if (!is_confimed) {
				throw new BadRequestException(`Backhome protector warns that this operation may cause the power consumption to ${result.total_max_power} W while the limit is ${this.warn_threshold} W
					Please consider selecting "allow unsafe operation" to confirm that you know what you are doing.`);
			} else {
				console.warn(`An operation may cause the power consumption to ${result.total_max_power} W while the warning limit is ${this.warn_threshold} W`);
			}
		}
		return result
	}
}
