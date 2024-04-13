# Zaychik Server

## Overview of the Zaychik Project

The **Project Zaychik** is a set of softwares designed for power controlling in supercomputing competitions (e.g. Student Cluster Competition in SC and ASC). It contains three parts:

- **Zaychik Server** - Runs on the master node (usually it is someone's laptop). It is a web server that provides a web interface and RESTful APIs for power monitoring & controlling.
- **Zaychik Agent** - You need to implement your own Agent to run on the compute nodes. It communicates with the Zaychik Server and applies the frequency/fan speed changes. As hardware varies, the Agent should be implemented by yourself.
- **Zaychik App Runner** - Runs on one compute node. It monitors the stdout of the application and controls the power of the node according to the output of the application. Useful in HPL. We are rewriting and will publish the code as soon as possible

```plain
                          (c)            RESTful APIs
User / Zaychik App Runner --------------------------- Zaychik Server
                                            	(s)     |    |    | (c)
                                                        |    |    |
                                                        |    |    |
                                                        |    |    | (s)
					             Zaychik Agent ... Agent
(c): Client
(s): Server
```

## Zaychik Server

Zaychik Server is a web server written in TypeScript+Nest.js (backend) and TypeScript+Vue (frontend). It

- Provide RESTful APIs for CPU/GPU frequency adjustment and fan speed controlling
- Provide a web interface for CPU/GPU frequency adjustment and fan speed controlling (based on the RESTful APIs)
- Log historical power consumption data to a database (MariaDB) which can be visualized in grafana
- Communicate with Zaychik Agent to apply the frequency/fan speed changes
- Provide some other features, including:
  - A simple "brake" system, which sets the frequency to the lowest value when the power consumption is too high
  - A set of "backhome prevention" policies that shows the user a warning when the power consumption may go too high under the current frequency limits
  
    *("backhome" means "回家的诱惑" in Chinese, which comes from one rule in SCC23: "A power consumption higher than 4900W results in disqualification")*

## Zaychik App Runner

A very simple program that runs the target program and ensures everything is under control. We will release an example for it, but writing one yourself is very easy. Simply run the program and send commands to the server while it is running.

## TODO

- [ ] Update the power consumption API for common use cases. We currently monitor power using an OCR tool (not yet open-sourced), but it is not suitable for daily usage.
- [ ] Add example code for App Runner 
