# Zaychik Server

## Overview of the Zaychik Project

The **Project Zaychik** is a set of softwares designed for power controlling in supercomputing competitions (e.g. Student Cluster Competition in SC and ASC). It contains three parts:

- **Zaychik Server** - Runs on the master node (usually it is someone's laptop). It is a web server that provides a web interface and RESTful APIs for power monitoring & controlling.
- **Zaychik Agent** - You need to implement your own Agent to run on the compute nodes. It communicates with the Zaychik Server and applies the frequency/fan speed changes. As hardware varies, the Agent should be implemented by yourself.

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

This repository contains the source code of the Zaychik Server. It is a web server written in TypeScript+Nest.js (backend) and TypeScript+Vue (frontend). It

- Provide RESTful APIs for CPU/GPU frequency adjustment and fan speed controlling
- Provide a web interface for CPU/GPU frequency adjustment and fan speed controlling (based on the RESTful APIs)
- Log historical power consumption data to a database (MariaDB) which can be visualized in grafana
- Communicate with Zaychik Agent to apply the frequency/fan speed changes
- Provide some other features, including:
  - A simple "brake" system, which sets the frequency to the lowest value when the power consumption is too high
  - A set of "backhome prevention" policies that shows the user a warning when the power consumption may go too high under the current frequency limits
  
    *("backhome" means "回家的诱惑" in Chinese, which comes from one rule in SCC23: "A power consumption higher than 4900W results in disqualification")*
