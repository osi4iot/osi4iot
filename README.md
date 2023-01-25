# Open Source Integration for Internet Of Things (OSI4IOT)

![Windows](https://img.shields.io/badge/Windows-gray?style=flat&logo=windows)
![Linux](https://img.shields.io/badge/Linux-gray?style=flat&logo=linux)
![Machintosh](https://img.shields.io/badge/Machintosh-gray?style=flat&logo=Machintosh)
[![Link:Docker](https://img.shields.io/badge/Docker-gray?style=flat&logo=docker&link=https://www.docker.com/)](https://www.docker.com/)
[![Link:Telegram](https://img.shields.io/badge/Telegram-gray?style=flat&logo=telegram&link=https://web.telegram.org/k/)](https://web.telegram.org/k/)
[![Link:Mosquitto](https://img.shields.io/badge/Mosquitto-gray?style=flat-square&logo=Mosquitto&logoColor=blue&link=https://github.com/eclipse/mosquitto)](https://github.com/eclipse/mosquitto)
[![Link:Node-RED](https://img.shields.io/badge/Node--RED-gray?style=flat-square&logo=node-red&logoColor=blue&link=https://github.com/node-red/node-red)](https://github.com/node-red/node-red)
[![Link:PostgreSQL](https://img.shields.io/badge/PostgreSQL-gray?style=flat-square&logo=PostgreSQL&logoColor=blue&link=https://www.postgresql.org/)](https://www.postgresql.org/)
[![Link:Timescaledb](https://img.shields.io/badge/Timescaledb-gray?style=flat-square&logo=Timescaledb&logoColor=blue&link=https://www.timescale.com/)](https://www.timescale.com/)
[![Link:Pgadmin](https://img.shields.io/badge/Pgadmin-gray?style=flat-square&logo=Pgadmin&logoColor=blue&link=https://www.pgadmin.org/)](https://www.pgadmin.org/)
[![Link:Grafana](https://img.shields.io/badge/Grafana-gray?style=flat-square&logo=Grafana&logoColor=blue&link=https://grafana.com/)](https://grafana.com/)
[![Link:Traefik](https://img.shields.io/badge/Traefik-gray?style=flat-square&logo=Traefik&logoColor=blue&link=https://doc.traefik.io/traefik/)](https://doc.traefik.io/traefik/)
[![Link:Minio](https://img.shields.io/badge/Minio-gray?style=flat-square&logo=Minio&logoColor=blue&link=https://min.io/)](https://min.io/)
[![Link:Portainer](https://img.shields.io/badge/Portainer-gray?style=flat-square&logo=Portainer&logoColor=blue&link=https://www.portainer.io/)](https://www.portainer.io/)
[![Link:Keepalived](https://img.shields.io/badge/Keepalived-gray?style=flat&logo=Keepalived&link=https://github.com/acassen/keepalived)](https://github.com/acassen/keepalived)

<!-- ![img:frontpage_dataflow](./docs/img/frontpage_dataflow.png) -->

Open Source Integration for Internet Of Things (IoT) is a framework that facilitates the integration of open-source software and hardware in IoT devices.

## Description

This repository contains implementation of Open Source Integration for IoT devices. The OSI model is a framework that describes how different open-source software and hardware components can be integrated in IoT devices. By understanding and applying the OSI model, developers can build robust, flexible and cost-effective IoT systems.

![img:description_tank](./docs/img/description_tank.png)

## Table of contents
- [About](#about)
- [Quick Start](#quick_start)
- [Getting Started](#getting_started)
- [Instalation](#instalation)
- [Other instructions, Specifications, Attributes or Project Info](#other_instructions,_Specifications,_Attributes,_or_Project_Info)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Test](#test)
- [Example](#example)
## About
The OSI4IOT platform has been developed to give answer to all the elements required in the Shipyard 4.0 strategy. The OSI4IOT name stand for "Open Source Integration For Internet of Thing". This project continues in development and can be download from the web address: https://github.com/osi4iot/osi4iot.

## Status


- [x] Mqqt 
- [x] Digital twin model
- [x] Dashboard
- [ ] Machine Learning 
- [ ] 
- [ ] 
- [ ] 
- [ ] 

## Quickstart (For The Impatient)

## Getting Started



### Requirements

In order to have the OSI4IOT platform running correctly, the following requirements must be met:
-	Installation of Docker in the Operative System (OS). Please read: [![Link:Docker](https://img.shields.io/badge/Docker-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/docker.md).
-	Creation of a Telegram Bot for notification. Please read: [![Link:Telegram](https://img.shields.io/badge/Telegram-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/telegram.md).
    -	Obtain the Telegram bot token.
    -	Obtain the group ID of the Telegram group for the main organization's default group.
    -	Obtain the Telegram invitation link for the main organization's default group.
-	Have a domain name to access the platform through a webpage.
-	Have an email address to send notifications from the platform. The password for this email is also required.

## Installation

To install the osi4iot package from Github, use the following command:
```
git clone https://github.com/osi4iot/osi4iot
cd osi4iot
```

The Command Line Interface (CLI) can be installed by running the appropriate script inside the `osi4iot` repository.

>./utils/osi4iot_cli/dist/

<details>
<summary>Distribution information</summary>
<p>

![img:installation_distGitHub](./docs/img/installation_distGitHub.png)


The folders for installation found in the subfolder indicate the type of operative system and architecture. The following table contains a summary:

| **Operative System** | **Architecture** | **Installer Folder** |
| -------------------- | ---------------- | -------------------- |
| **Windows**          | AMD (x64)        | win_x64              |
| **Linux**            | AMD (x64)        | linux_x64            |
| **Linux**            | ARM (arm64)      | linux_arm64          |
| **Mac**              | AMD (x64)        | linux_x64            |

The ARM architecture in Linux is specially build for low consuming microprocessors such as Raspberry Pi or similar. These types of microprocessors are very common in the building of any IOT infrastructure.

</p>
</details>

<details>
<summary>CLI installation</summary>
<p>



To proceed with the installation, download the appropriate installer for your system and run it in the terminal. For example, on a UNIX-based system such as Linux ARM, you can use the following command:

    mkdir <my project>  // Example: mkdir iot_fiber4yard
    cd <myproject>      // Example: cd iot_fiber4yard

Download the appropriate installer for your system.

In this case, if you are using a Linux ARM 64-bit system, you can download the linux_arm64 installer from https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/linux_arm64/osi4iot_installer_linux_arm64.sh or by using the following command:

    curl -o osi4iot_installer_linux_arm64.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/linux_arm64/osi4iot_installer_linux_arm64.sh 

And execute the installer

    bash osi4iot_installer_linux_arm64.sh

</p>
</details>

<details>
<summary>Platform initialization</summary>
<p>

</p>
</details>

## Other Instructions, Specifications, Attributes, or Project Info
<!-- ### Docker  -->

## Concepts

Roles (org, group, device, sensor, stake holder, dtm)

## Usage

![img:frontpage_dataflow](./docs/img/frontpage_dataflow.png)

(DTM, Dashboard, Node-red)

## Contributing
We welcome contributions to OSI4IOT. Please read [CONTRIBUTING.md](https://github.com/%3Cyour_username%3E/OSI4IOT/blob/master/CONTRIBUTING.md) for more information.

## Acknowledgements

## License
This project is licensed under the MIT License - see the [LICENSE](https://github.com/%3Cyour_username%3E/OSI4IOT/blob/master/LICENSE) file for details.
## Test


## Examples