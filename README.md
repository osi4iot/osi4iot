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

If the Platform CLI has been correctly installed, then initialize the platform by typing

    osi4iot

A message prompt similar to this should appear:

    ************************************************
    **   WELCOME TO OSI4IOT PLATFORM CLI v1.1.0  **
    ************************************************

    ? Select the place of deployment of the platform: (Use arrow keys)
    > Local deployment
    On-premise cluster deployment
    AWS cluster deployment

<details>
<summary> Local Deployment </summary> 
<p>

Select the local deployment option. The following options will be available

    ************************************************
    **   WELCOME TO OSI4IOT PLATFORM CLI v1.1.0  **
    ************************************************

    ? Select the place of deployment of the platform: Local deployment

    Init platform
    Run platform
    Clear screen
    List organizations
    Create organization
    Update organization
    Remove organization
    Recover nodered instances
    List nodes
    Add nodes
    Remove node
    Update domain certs
    Platform status
    Stop platform
    Delete platform
    Exit

To initialize the platform for first time, use

    Init platform

Several fields will be then prompt to be input. If enter pressed, the option between parenthesis will be inserted instead.

    ************************************************
    **   WELCOME TO OSI4IOT PLATFORM CLI v1.1.0  **
    ************************************************

    ? Select the place of deployment of the platform: Local deployment

    ? Choose one of the following options:  Init platform
    ? Platform name: OSI-DEMO
    ? Domain name: iot_fiber4yards_demo.org
    ? Platform motivational phrase: Open source integration for internet of things
    ? Platform admin first name: admin_f4y
    ? Platform admin last name: demo
    ? Platform admin user name: admin_f4y_demo
    ? Platform admin email: admin_f4y_demo@gmail.com
    ? Platform admin password: **************
    ? Retype platform admin password: **************
    ? Min longitude of the geographical zone of the platform: -10.56884765625
    ? Max longitude of the geographical zone of the platform: 1.42822265625
    ? Min latitude of the geographical zone of the platform: 35.55010533588552
    ? Max latitude of the geographical zone of the platform: 44.134913443750726
    ? Default time zone: Europe/Madrid
    ? Main organization name: My main org
    ? Main organization acronym: MYORG
    ? Main organization address: fake street, fake number
    ? Main organization city: fake city
    ? Main organization zip code: 00000
    ? Main organization state/province: fake province
    ? Main organization country: Spain
    ? Telegram boottoken for main organization default group: 5342540378:AAHrJ4ABFiX54m6uf9RvxHxLRKeo0dGiHA0
    ? Telegram chat id for main organization default group: -694425020
    ? Telegram invitation link for main organization default group: https://t.me/+MgGprvw5SAozODq0
    ? Number of node-red instances in main org: 3
    ? Email account for platform notifications: admin_f4y_demo@gmail.com
    ? Email account password: **************
    ? S3 storage bucket name: osi-demo

The different entries are defined in [![Link:local_deployment](https://img.shields.io/badge/Local_Deployment-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/local_deployment_entries.md).

Next, select the type of certificate for your domain SSL certification.

    ? Choose the type of domain ssl certs to be used: (Use arrow keys)
    > No certs
    Certs provided by an CA
    Let's encrypt certs and AWS Route 53
    AWS Certificate Manager

A guideline for the SSL certificates is found in [![Link:ssl_certs](https://img.shields.io/badge/SSL_Certs-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/ssl_certs.md).

</p>
</details>

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