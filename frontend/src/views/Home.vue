<script lang="ts" setup>
import { onMounted } from 'vue';
import { Ref, ref } from 'vue';
import { FanCurve, FanCurvePoint, HistoryStat, CurrentLimitsOfOneServer, CurrentLimits, StaticInfoOfOneServer, StaticInfo, BackhomeConsultResult } from "zaychik-server-proto";
import { fetchWithJson } from '@/lib';
import { stat } from 'fs';

const CURRENT_LIMITS_UPDATE_INTERVAL = 1000;
const num_fan_curve_points = 5;

let opened_panels = ref([0, 1, 2]); // Open all panels by default

let current_limits: Ref<CurrentLimits> = ref({
  nodes: []
});

let last_power_peak: Ref<number> = ref(0);

// Fetch static_info
let static_info: StaticInfo = await fetchWithJson("/api/static-info", "GET", {}).catch((error: Error) => {
  console.log(error);
  alert(`Failed to fetch static_info: ${error}`);
});

// Some variables for convenience
const num_nodes: number = static_info.nodes.length;
console.log("static_info", static_info)

// let current_limits: Ref<CurrentLimits> = ref({
//   nodes: [
//     {
//       cur_cpu_freq_limits: [1200, 1200, 1200, 1200, 2000, 2000, 3400, 3400],
//       cur_gpu_freq_limit: 1200,
//       cur_fan_curves: [
//         [
//           {temp: 10, speed: 20},
//           {temp: 30, speed: 40},
//           {temp: 50, speed: 60},
//           {temp: 70, speed: 80},
//           {temp: 90, speed: 100},
//         ],
//         [
//           {temp: 10, speed: 40},
//           {temp: 30, speed: 40},
//           {temp: 50, speed: 80},
//           {temp: 70, speed: 80},
//           {temp: 90, speed: 100},
//         ]
//       ]
//     },
//     {
//       cur_cpu_freq_limits: [1200, 1200, 1200, 1200, 2000, 2000, 3400, 3400],
//       cur_gpu_freq_limit: 600,
//       cur_fan_curves: [
//         [
//           {temp: 10, speed: 20},
//           {temp: 30, speed: 40},
//           {temp: 50, speed: 60},
//           {temp: 70, speed: 80},
//           {temp: 90, speed: 100},
//         ],
//         [
//           {temp: 10, speed: 40},
//           {temp: 30, speed: 40},
//           {temp: 50, speed: 80},
//           {temp: 70, speed: 80},
//           {temp: 90, speed: 100},
//         ]
//       ]
//     }
//   ]
// });

// let static_info: Ref<StaticInfo> = ref({
//   nodes: [
//     {
//       cpu_supported_clocks: [1200, 2000, 3400],
//       num_cpu_cores: 8,
//       gpu_supported_clocks: [200, 600, 1200],
//       num_gpus: 2,
//       num_fans: 2,
//       fan_style: "asc"
//     },
//     {
//       cpu_supported_clocks: [1200, 2000, 3400],
//       num_cpu_cores: 8,
//       num_gpus: 2,
//       num_fans: 2,
//       gpu_supported_clocks: [200, 600, 1200],
//       fan_style: "asc"
//     }
//   ]
// });

onMounted(() => {
  // Set up the timer to fetch current_limits
  update_current_limits();
  window.clearInterval(window.current_limits_update_timer); 
  window.current_limits_update_timer = setInterval(update_current_limits, CURRENT_LIMITS_UPDATE_INTERVAL);
})

function update_current_limits() {
  fetchWithJson("/api/current-limits", "GET", {}).then((result: CurrentLimits) => {
    current_limits.value = result;
  }).catch((error: Error) => {
    console.log(error);
    alert(`Failed to fetch current_limits: ${error}`);
  });
}

// pick_up_color: pick up a color from a color gradient
// This function is written by ChatGPT
function pick_up_color(value: number, min: number, max: number, reverse: boolean = false) {
  if (reverse) {
    value = max + min - value;
  }
  let hue = (value - min) / (max - min) * 120;
  return `hsl(${hue}, 70%, 50%)`;
}

function get_cpu_clocks_description_html(cur_limits: number[], supported_clocks: number[]) {
  const min_supported_clock = Math.min(...supported_clocks);
  const max_supported_clock = Math.max(...supported_clocks);
  let result_html = "";
  const add_to_result = (clock: number, count: number) => {
    if (result_html !== "") {
      result_html += ", &nbsp;"
    }
    const color = pick_up_color(last_clock, min_supported_clock, max_supported_clock);
    result_html += `<span style="color: ${color};">${clock}</span> × ${count}`;
  }

  let last_clock = -1;
  let last_clock_count = 0;
  for (let clock of cur_limits) {
    if (clock !== last_clock) {
      if (last_clock_count !== 0) {
        add_to_result(last_clock, last_clock_count);
      }
      last_clock = clock;
      last_clock_count = 0;
    }
    last_clock_count += 1;
  }
  if (last_clock_count !== 0) {
    add_to_result(last_clock, last_clock_count);
  }
  return result_html;
}

function get_gpu_clock_description_html(cur_limit: number, num_gpus: number, supported_clocks: number[]) {
  if (!supported_clocks || supported_clocks.length === 0) {
    return ''
  }
  let min_supported_clock = Math.min(...supported_clocks);
  let max_supported_clock = Math.max(...supported_clocks);
  let color = pick_up_color(cur_limit, min_supported_clock, max_supported_clock);
  return `<span style="color: ${color};">${cur_limit}</span> × ${num_gpus}`;
}

function get_fan_curve_description_html(cur_curves: FanCurve, fan_style: "asc" | "sc") {
  // Step 1. Group up cur_curves
  let result = '';
  for (let point of cur_curves) {
    if (result !== '') {
      result += ', &nbsp;';
    }
    let temp_color = pick_up_color(point.temp, 10, 100, true);
    let speed_color = pick_up_color(point.speed, 0, 100);
    result += `(<span style="color: ${temp_color}">${point.temp}°C</span>, <span style="color: ${speed_color}">${point.speed}%</span>)`;
  }
  return result;
}

// Variables below are for adjusting

let entered_cpu_clocks = ref(Array(num_nodes).fill(''));
let entered_gpu_clocks = ref(Array(num_nodes).fill(''));
let entered_fan_speeds = ref(Array(num_nodes).fill(''));
let entered_is_confirmed_to_warning = ref(false);

// interpretCpuClockExpression - Interpret a CPU clock expression
// A CPU clock expression defines the clock limit of all cores on one node
// 
// `A CPU clock expression` = `clock` | `part`, `part`, ..., `part`
//                   `part` = `clock` | `clock`x`num`
//                  `clock` = a number
//                   `num`  = a number
// 
// Cores will be assigned with the corresponding clock in the expression. For example,
// 800, 3400x4, 800x5, 3400x5 means setting core 0, 5, 6, 7, 8, 9 to 800 MHz while
// setting core 1, 2, 3, 4, 10, 11, 12, 13, 14 to 3400 MHz
function interpretCpuClockExpression(expr: string, num_cores: number, valid_clocks: number[]): { valid: boolean | string, result: number[] } {
  // If clock is a single number, then it means "setting all cores to this clock"
  const single_number_regex = /^\d+$/;
  if (single_number_regex.test(expr)) {
    let clock = parseInt(expr);
    if (!valid_clocks.includes(clock)) {
      return { valid: `invalid clock: ${clock}`, result: [] };
    }
    return { valid: true, result: Array(num_cores).fill(clock) };
  }
  // If clock is a list of "CLOCKxNUM" (seperated by commas), then it means "setting NUM cores to CLOCK
  let result: number[] = [];
  const parts = expr.split(',');
  for (let part of parts) {
    let [clock_str, num_str] = part.split('x');
    let clock = parseInt(clock_str);
    let num = num_str ? parseInt(num_str) : 1;
    if (!valid_clocks.includes(clock)) {
      return { valid: `invalid clock: ${clock}`, result: [] };
    }
    for (let i = 0; i < num; ++i) {
      result.push(clock);
    }
  }
  if (result.length !== num_cores) {
    return { valid: `invalid number of clocks: ${result.length} (${num_cores} expected)`, result: [] };
  }
  return { valid: true, result: result };
}

// interpretFanSpeedExpression - Interpret a fan speed expression
// A fan speed expression defines the fan speed curves of all fans on one node
// 
// `A fan speed expression` = (`curve` | `curves`), ...
//                 `curves` = `curve` x `count`
//                  `count` = a number
//                  `curve` = [`point`, `point`, `point`, `point`, `point`] | `speed`
//                  `point` = "(" `temp`, `speed` ")"
//                   `temp` = a number
//                  `speed` = a number
// 
// Example:
// [(10, 20), (30, 40), (50, 60), (70, 80), (90, 100)], [(10, 30), (30, 60), (50, 60), (70, 80), (90, 100)] x 3
function interpretFanSpeedExpression(expr: string, num_fans: number): { valid: boolean | string, result: FanCurve[] } {
  // This is a ugly parser :-(
  function splitByTopLevelCommas(input: string, left_brackets: string[], right_brackets: string[]): string[] {
    let result: string[] = [];
    let cur_str: string = '';
    let cur_level: number = 0;
    for (let i = 0; i < input.length; ++i) {
      if (left_brackets.includes(input[i])) {
        cur_level += 1;
      } else if (right_brackets.includes(input[i])) {
        cur_level -= 1;
        if (cur_level < 0) {
          throw new Error(`invalid expression: unmatched "${input[i]}" in ${input}`);
        }
      } else if (input[i] === ',' && cur_level === 0) {
        result.push(cur_str);
        cur_str = '';
        continue;
      }
      cur_str += input[i];
    }
    if (cur_str) result.push(cur_str);
    if (cur_level !== 0) {
      throw new Error(`invalid expression: unbalanced parentheses in ${input}`);
    }
    return result;
  }
  function removeAllBrackets(input: string) {
    const brackets = ['(', ')', '[', ']', ' '];
    let result = '';
    for (let i = 0; i < input.length; ++i) {
      if (!brackets.includes(input[i])) {
        result += input[i];
      }
    }
    return result;
  }

  try {
    // Step 1. Find all top-level commas
    // Here "top-level" means that it is not surrounded by any parentheses
    let parts: string[] = splitByTopLevelCommas(expr, ['[', '('], [']', ')']);
    // Step 2. Parse all parts
    let result: FanCurve[] = [];
    console.log(parts)
    for (let part of parts) {
      // If the part has a `x` then it is a "curves", otherwise it is a "curve"
      const is_curves: boolean = part.includes('x');
      let curve_str: string = '';
      let count: number = 1;
      if (is_curves) {
        let [curve_str_, count_str] = part.split('x');
        count = parseInt(count_str);
        curve_str = curve_str_;
        if (isNaN(count)) {
          throw new Error(`invalid expression: invalid count: ${count_str}`);
        }
      } else {
        curve_str = part;
        count = 1;
      }
      // parseCurve: Parse a curve that looks like [(1, 2), (3, 4), (5, 6), (7, 8), (9, 10)]
      // We gu ji chong shi and use a stack to find all top-level commas
      let final_curve: FanCurve = []
      {
        const single_number_regex = /^\d+$/;
        if (single_number_regex.test(removeAllBrackets(curve_str))) {
          let speed = parseInt(removeAllBrackets(curve_str));
          if (isNaN(speed) || speed < 0 || speed > 100) {
            throw new Error(`invalid expression: invalid speed: ${speed}`);
          }
          final_curve = [
            {temp: 10, speed},
            {temp: 30, speed},
            {temp: 50, speed},
            {temp: 70, speed},
            {temp: 100, speed},
          ]
        } else {
          let point_strs: string[] = splitByTopLevelCommas(curve_str, ['('], [')']);
          for (let point_str of point_strs) {
            let [temp_str, speed_str] = point_str.split(',');
            temp_str = removeAllBrackets(temp_str);
            speed_str = removeAllBrackets(speed_str);
            let temp = parseInt(temp_str);
            let speed = parseInt(speed_str);
            if (isNaN(temp) || temp < 0 || temp > 100) {
              throw new Error(`invalid expression: invalid temp: ${temp_str}`);
            } else if (isNaN(speed) || speed < 0 || speed > 100) {
              throw new Error(`invalid expression: invalid speed: ${speed_str}`);
            }
            final_curve.push({ temp, speed });
          }
          if (final_curve.length !== num_fan_curve_points) {
            throw new Error(`invalid number of points: ${final_curve.length} (${num_fan_curve_points} expected)`);
          }
        }
      }
      for (let i = 0; i < count; ++i)
        result.push(final_curve)
    }

    if (result.length !== num_fans) {
      throw new Error(`invalid number of fan curves: ${result.length} (${num_fans} expected)`);
    }

    return { valid: true, result: result };
  } catch (error: any) {
    return { valid: error.message, result: [] };
  }
}

function onSubmitCpuClocks() {
  let clocks: number[][] = [];
  for (let i = 0; i < num_nodes; ++i) {
    let { valid, result } = interpretCpuClockExpression(entered_cpu_clocks.value[i], static_info.nodes[i].num_cpu_cores, static_info.nodes[i].cpu_supported_clocks);
    if (valid !== true) {
      alert(`Invalid input for node ${i+1}: ${valid}`);
      return;
    }
    clocks.push(result);
  }
  fetchWithJson("/api/cpu", "PUT", {
    clocks,
    is_confirmed_to_warning: entered_is_confirmed_to_warning.value
  }).then((res: BackhomeConsultResult) => {
    last_power_peak.value = res.total_max_power;
    alert(`Successfully set CPU clocks\nNew backhome consult result: ${JSON.stringify(res)}\nClocks: ${JSON.stringify(clocks)}.\n`);
  }).catch((error: Error) => {
    console.log(error);
    alert(`Failed to submit cpu clocks: ${error}`);
  });
}

function onSubmitGpuClocks() {
  console.log(entered_gpu_clocks.value);
  let clocks: (number | null)[] = entered_gpu_clocks.value.map((x) => parseInt(x));
  for (let i = 0; i < num_nodes; ++i) {
    if (static_info.nodes[i].num_gpus === 0) {
      clocks[i] = null;
      continue;
    }
    if (!clocks[i] || !static_info.nodes[i].gpu_supported_clocks.includes(clocks[i]!)) {
      alert(`Invalid input for node ${i+1}: ${clocks[i]}`);
      return;
    }
  }
  fetchWithJson("/api/gpu", "PUT", {
    clocks,
    is_confirmed_to_warning: entered_is_confirmed_to_warning.value
  }).then((res: BackhomeConsultResult) => {
    last_power_peak.value = res.total_max_power;
    alert(`Successfully set GPU clocks\nNew backhome consult result: ${JSON.stringify(res)}\nClocks: ${JSON.stringify(clocks)}.\n`);
  }).catch((error: Error) => {
    console.log(error);
    alert(`Failed to submit gpu clocks: ${error}`);
  });
}

function onSubmitFanSpeeds() {
  console.log(entered_fan_speeds.value)
  let curves: FanCurve[][] = [];
  for (let i = 0; i < num_nodes; ++i){
    let { valid, result } = interpretFanSpeedExpression(entered_fan_speeds.value[i], static_info.nodes[i].num_fans);
    if (valid !== true) {
      alert(`Invalid input for node ${i+1}: ${valid}`);
      return;
    }
    curves.push(result);
  }
  fetchWithJson("/api/fan", "PUT", {
    curves,
    is_confirmed_to_warning: entered_is_confirmed_to_warning.value
  }).then((res: BackhomeConsultResult) => {
    last_power_peak.value = res.total_max_power;
    alert(`Successfully set fan curves\nNew backhome consult result: ${JSON.stringify(res)}\nClocks: ${JSON.stringify(curves)}.\n`);
  }).catch((error: Error) => {
    console.log(error);
    alert(`Failed to submit fan curves: ${error}`);
  });
}

</script>

<template>
  <v-container fluid>
    <v-row no-gutters>
      <v-col cols=4 style="padding-right: 10px;" id="left-side-panel">
        <v-row justify="space-around">
          <v-col cols=3>
            <v-img src="/haxxor_bunny.png" :width=100></v-img>
          </v-col>
          <v-col cols=8 style="display: flex; align-items: center;">
            <h1 style="color: #57AFF8; font-size: 40px; font-weight: 300; letter-spacing: 1px">
              Zaychik Server
            </h1>
          </v-col>
        </v-row>
        <v-divider style="margin: 10px 0px; color: #6cf; opacity: 1"></v-divider>
        <v-card>
          <v-card-text>
            <v-container fluid class="pt-2 pb-2">
              <v-row style="font-size: 16px;" dense>
                <v-col cols="4">
                  Power Peak (est.)
                </v-col>
                <v-divider :vertical="true"></v-divider>
                <v-col class="pl-6" cols="8">
                  {{ last_power_peak }} W
                </v-col>
              </v-row>
            </v-container>
          </v-card-text>
        </v-card>
        <v-card>
          <v-card-title>CPU</v-card-title>
          <v-card-text>
            <v-container fluid class="pt-2 pb-2">
              <v-row v-for="(_, index) in current_limits.nodes.length" :key="index" style="font-size: 16px;" dense>
                <v-col cols="2">
                  Node {{ index+1 }}
                </v-col>
                <v-divider :vertical="true"></v-divider>
                <v-col class="pl-6" cols="10" v-html="get_cpu_clocks_description_html(current_limits.nodes[index].cur_cpu_freq_limits, static_info.nodes[index].cpu_supported_clocks)">
                </v-col>
              </v-row>
            </v-container>
          </v-card-text>
        </v-card>
        <v-card>
          <v-card-title>GPU</v-card-title>
          <v-card-text>
            <v-container fluid class="pt-2 pb-2">
              <v-row v-for="(_, index) in current_limits.nodes.length" :key="index" style="font-size: 16px;" dense>
                <v-col cols="2">
                  Node {{ index+1 }}
                </v-col>
                <v-divider :vertical="true"></v-divider>
                <v-col class="pl-6" cols="10" v-html="get_gpu_clock_description_html(current_limits.nodes[index].cur_gpu_freq_limit, static_info.nodes[index].num_gpus, static_info.nodes[index].gpu_supported_clocks)">
                </v-col>
              </v-row>
            </v-container>
          </v-card-text>
        </v-card>
        <v-card>
          <v-card-title>Fan</v-card-title>
          <v-card-text class="pl-2 pr-2">
            <v-container fluid class="pt-2 pb-2">
              <v-row v-for="(_, node_index) in current_limits.nodes.length" :key="node_index" style="font-size: 16px;" dense>
                <v-col cols="2">
                  Node {{ node_index+1 }}
                  <div v-if="static_info.nodes[node_index].fan_style === 'asc'" style="margin-top: 10px; color: #e00; font-size: 14px">(asc)</div>
                </v-col>
                <v-col cols="10">
                  <v-row v-for="(_, fan_index) in current_limits.nodes[node_index].cur_fan_curves.length" :key="fan_index" style="font-size: 11px;" dense>
                    <v-col cols="1">
                      {{ fan_index+1 }}
                    </v-col>
                    <v-divider :vertical="true"></v-divider>
                    <v-col class="pl-2" cols="11" v-html="get_fan_curve_description_html(current_limits.nodes[node_index].cur_fan_curves[fan_index], static_info.nodes[node_index].fan_style)">
                    </v-col>
                  </v-row>
                </v-col>
              </v-row>
            </v-container>
          </v-card-text>
        </v-card>
      </v-col>

      <v-divider :vertical=true style="color: #6cf; opacity: 1"></v-divider>

      <v-col cols=8 id="right-side-panel" style="padding-left: 10px;">
        <v-expansion-panels :multiple=true v-model="opened_panels">
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon icon="mdi-memory"></v-icon>
              <h2> CPU </h2>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-container fluid>
                <v-form
                @submit.prevent="onSubmitCpuClocks" dense>
                  <v-row v-for="(_, index) in num_nodes" dense class="align-center">
                    <v-col cols="1">
                      Node{{ index+1 }}
                    </v-col>
                    <v-col cols="7">
                      <v-text-field
                        label="clock expr"
                        density="compact"
                        :rules="[(value) => !value ? 'must not empty' : interpretCpuClockExpression(value, static_info.nodes[index].num_cpu_cores, static_info.nodes[index].cpu_supported_clocks).valid]"
                        variant="outlined"
                        hide-details="auto"
                        v-model="entered_cpu_clocks[index]"
                      ></v-text-field>
                    </v-col>
                    <v-col cols="4" class="pl-4">
                      <span style="font-size: 12px;">
                        Available clocks: {{ static_info.nodes[index].cpu_supported_clocks }}
                      </span>
                    </v-col>
                  </v-row>
                  <v-row class="mt-3">
                    <v-btn
                    block
                    color="green"
                    variant="outlined"
                    prepend-icon="mdi-arrow-up"
                    type="submit"
                    >Submit</v-btn>
                  </v-row>
                </v-form>
              </v-container>
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon icon="mdi-expansion-card-variant"></v-icon>
              <h2> GPU </h2>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-container fluid>
                <v-form
                @submit.prevent="onSubmitGpuClocks">
                  <v-row v-for="(_, index) in num_nodes">
                    <v-col cols="12">
                      <v-row v-if="static_info.nodes[index].num_gpus !== 0" class="align-center">
                        <v-col cols="1">
                          Node{{ index+1 }}
                        </v-col>
                        <v-divider vertical></v-divider>
                        <v-col cols="2">
                          <v-text-field
                            v-model="entered_gpu_clocks[index]"
                            label="clock"
                            density="compact"
                            type="number"
                            hide-details="auto"
                            :rules="[(value) => !value ? 'value must not be empty' : static_info.nodes[index].gpu_supported_clocks.includes(parseInt(value)) ? true : 'invalid clock']"
                            variant="outlined"
                          ></v-text-field>
                        </v-col>
                        <v-col cols="9">
                          <span style="font-size: 11px;">
                            Available clocks: {{ static_info.nodes[index].gpu_supported_clocks }}
                          </span>
                        </v-col>
                      </v-row>
                    </v-col>
                  </v-row>
                  <v-row class="mt-5">
                    <v-btn
                    block
                    color="green"
                    variant="outlined"
                    prepend-icon="mdi-arrow-up"
                    type="submit"
                    >Submit</v-btn>
                  </v-row>
                </v-form>
              </v-container>
            </v-expansion-panel-text>
          </v-expansion-panel>
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon icon="mdi-fan"></v-icon>
              <h2> Fan </h2>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-container fluid>
                <v-form
                @submit.prevent="onSubmitFanSpeeds">
                  <v-row v-for="(_, index) in num_nodes" class="align-center">
                      <v-col cols="1">
                        Node{{ index+1 }}
                      </v-col>
                      <v-divider vertical></v-divider>
                      <v-col cols="10">
                        <v-textarea
                          v-model="entered_fan_speeds[index]"
                          auto-grow
                          rows="2"
                          label="speed expr"
                          density="compact"
                          :rules="[(value) => !value ? 'value must not be empty' : interpretFanSpeedExpression(value, static_info.nodes[index].num_fans).valid]"
                          variant="outlined"
                          hide-details="auto"
                        ></v-textarea>
                      </v-col>
                  </v-row>
                  <v-row class="mt-5">
                    <v-btn
                    block
                    color="green"
                    variant="outlined"
                    prepend-icon="mdi-arrow-up"
                    type="submit"
                    >Submit</v-btn>
                  </v-row>
                </v-form>
              </v-container>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <v-row class="mt-1">
          <v-col cols="12" class="pl-10">
            <v-switch
            label="Override warnings"
            v-model:model-value="entered_is_confirmed_to_warning"
            color="red"
            ></v-switch>
          </v-col>
        </v-row>
        <!-- <v-btn
        block
        color="red"
        prepend-icon="mdi-restore"
        class="mt-4"
        variant="outlined">
        Reset all
        </v-btn> -->
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped lang="scss">
#right-side-panel > .v-expansion-panels > .v-expansion-panel > .v-expansion-panel-title {
  > .v-icon {
    margin-right: 10px;
  }
  > h2 {
    font-size: 18px;
    font-weight: 400;
  }
}

#left-side-panel > .v-card {
  margin-bottom: 20px;
  .v-card-title {
    font-size: 20px;
    font-weight: 400;
    margin-bottom: 6px;
    background-color: #e0e0e0;
  }
}
</style>