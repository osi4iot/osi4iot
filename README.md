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



![img:intro_0](./docs/img/intro_0.jpg)

OSI4IOT is an IOT platform based in the integration of several open source packages with custom code. This repository contains implementation of the OSI4OT platform.

## Description

This OSI4IOT platform allows the creation of Digital Twins Models (DTM). A 3D respresentation of these DTM can be visualized in the web user interface of the platform. The different objects of the DTM are animated in function of the values recieved from sensors. Results provided by the Finite Elements Method can be integrated in the DTM. <br/><br/>

![img:description_tank](./docs/img/description_tank.png)

## Table of contents
- [About](#about)
- [Status](#status)
- [Getting Started](#getting_started)
- [Installation](#installation)
- [Glossary](#glossary)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)


<!-- - [About](#about)
- [Quick Start](#quick_start)
- [Getting Started](#getting_started)
- [Instalation](#instalation)
- [Other instructions, Specifications, Attributes or Project Info](#other_instructions,_Specifications,_Attributes,_or_Project_Info)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Test](#test)
- [Example](#example) -->
<!-- ## About
The OSI4IOT platform has been developed to give answer to all the elements required in the Industry 4.0 strategy. The OSI4IOT name stand for "Open Source Integration For Internet of Thing".  -->

## Status


- [x] Mqqt 
- [x] Digital twin model
- [x] Dashboard
- [ ] Machine Learning 


<!-- ## Quickstart (For The Impatient) -->

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

<!-- To install the osi4iot package from Github, use the following command:
```
git clone https://github.com/osi4iot/osi4iot
cd osi4iot
``` -->

The Command Line Interface (CLI) can be installed by running the appropriate script inside the `osi4iot` repository.

>./utils/osi4iot_cli/dist/

![img:installation_distGitHub](./docs/img/installation_distGitHub.png)

<!-- <details>
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
</details>  -->

<details>
<summary>CLI installation</summary>
<p>



To proceed with the installation, download the appropriate installer for your system and run it in the terminal. For example, on a UNIX-based system such as Linux ARM, you can use the following command:

    mkdir <my project>  // Example: mkdir iot_fiber4yard
    cd <myproject>      // Example: cd iot_fiber4yard

Download the appropriate installer for your system.

    // Installer Linux amd64:
    curl -o osi4iot_installer_linux_x64.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/linux_x64/osi4iot_installer_linux_x64.sh

    // Installer Linux arm64:
    curl -o osi4iot_installer_linux_arm64.sh https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/linux_arm64/osi4iot_installer_linux_arm64.sh

    // Installer Windows:
    curl -o osi4iot_installer_winx_x64.ps1 https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/win_x64/osi4iot_installer_winx_x64.ps1

For example, if you are using a Linux ARM 64-bit system, download and execute the installer by using

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

A guideline for the local deployment can be found in [![Link:local_deployment](https://img.shields.io/badge/Local_Deployment-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/local_deployment.md).

Next, select the type of certificate for your domain SSL certification.

    ? Choose the type of domain ssl certs to be used: (Use arrow keys)
    > No certs
    Certs provided by an CA
    Let's encrypt certs and AWS Route 53
    AWS Certificate Manager

A guideline for the SSL certificates is found in [![Link:ssl_certs](https://img.shields.io/badge/SSL_Certs-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/ssl_certs.md).

If the certificates are correctly introduced, the platform should be initialized correctly. A similar image to this one should be obtained.

![local:CA:0](./docs/img/cli_installed.jpg)

</p>
</details>

</p>
</details>

Now the platform should be accessible through the browser.

![local:CA:0](./docs/img/web_home.png)

<!-- ## Other Instructions, Specifications, Attributes, or Project Info -->
<!-- ### Docker  -->

## Glossary
<details>
<summary> The Industry 4.0  </summary>  
<p>

For a more extensive documentation visit [![Link:glossary](https://img.shields.io/badge/Glossary-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/roles.md).

The `OSI4IOT` ecosystem is not limited to monitor different sensors and to provide an equivalent 3D digital twin of an asset. When considering the Industry 4.0 technology, large and distinct information can be gathered, post-processed and generated. The platform is built around the concept of `Building Information Modeling` (`BIM`), a technology that aims to contain and interlink all information available in a unique integrated system.

In order to monitor and access the available `BIM` information. The platform divides the information in several layers or levels of hierarchy. 

![img:glossary:industry4.0](./docs/img/industry4_0.svg)


<!-- ![img:frontpage_dataflow](./docs/img/resize_50/frontpage_dataflow.png) -->







### Stakeholders and organizations

`Stakeholders` and `organizations` are the most external level of hierarchy found in the platform. The stakeholder represents an entity that can be either a `cluster of organizations` or a `unique organization`. The contents of a `stakeholder` is not limitted to the `partial` or `complete` content of the `same` organization, but `partial` or `complete` contents of `different` organizations. 

![img:glossary:stakeholders](./docs/img/stakeholders.svg)

Only the `platform admin` has access to all the information stored in each `stakeholder`, however, `different organizations` can share with each other partial information through a `organization-to-organization message protocol`.

#### The simple organization
___
The simplest stakeholder would be to harbor the `partial` or `complete` contents of a `unique organization`. In this case the stakeholder could be just a company and the immediate inner level of hierarchy, the `group` level, could be departments of the company.

#### Partners and more complex structures
___
When the structure of the stakeholder is not straightforward, for example in the case of a `cluster of organizations` harboring `partial` or `complete` content of the `different` organizations.

This type of structure could be useful in the case of a `unique organization` that not only subdivides its structure in departments at the `group` level, but also has `BIM` data from the partners, client and provider organizations, integrated in the platform.

The most complex infrastructure that can be deployed and integrated in the `OSI4IOT` platform would be the case of different organizations working together (`cluster`) and wanting to digitalize and interconnect their processes and information generated. In this case the stakeholder level would be the `cluster` and the `group` level would be comprised from `organization's departments` to `partners`.

Inside the platform, the `organizations` or `stakeholders` are geolocated and displayed in the map with all their content information (`groups`, `devices` and `nodes`).

![img:glossary:stakeholders:ma](./docs/img/web_orgs.png)

### Groups

The next level of hierarchy is the `group`. This level offers the possibility to divide the `bim` information stored in the platform in different compartments. This way only members that are at the `stakeholder` or `organizations` level can access to all the groups, but a unique member of a specific group cannot access the information of another group.

![img:glossary:groups](./docs/img/groups.svg)

Although a member of `Group 1` would not have access to `Group 2`. There is the possibility to share information between groups using a `group-to-group message protocol` similar to the protocol between `organizations`.

Inside the platform, the `groups` are geolocated and displayed in the map inside the domain of their `organization`, the information that can be displayed are the `devices` and `nodes` of the `group`.

![img:glossary:groups:map](./docs/img/web_group.png)






### Devices

The type of information stored inside a `group` are `devices`. These are the next hierarchy level. Each `group` within an `organization` can have several `devices` connected to internet to send data. These `devices` can be PLCs, microcontrollers, microcomputers (like Raspberry Pi), IOT gateways (like SIMATIC IOT2050 of Siemens), etc. 

![img:glossary:devices](./docs/img/devices.svg)

In the platform, the `devices` are geolocated inside their corresponding `group` and displayed with a bubble. Each `device` contains `assets`.

![img:glossary:devices:map](./docs/img/web_dev.png)

### Assets

A `device` can have one or more industrial machines connected to it in order to control the production process. This machines or parts of a machine are represented by `assets`.

![img:glossary:assets](./docs/img/assets.svg)

In the platform there are different types of assets. 

-	Sensors

    An `asset` can have multiple sensors to measure the relevant parameters that allow defining its status. Temperature, pressure, viscosity or accelerometer sensors are typically used in the manufacturing industry.

-	Digital twins

    An `asset` can have one or several digital twins. A digital twin is a virtual model designed for accurately reflect the physical state of the asset. The function of the digital twin models are the following. 

    -	Asset state monitoring
    -	Predictive maintenance
    -	Alert system in case of incidents

    To implement a digital twin, machine learning models trained by mean of the data collected by the sensors, can be used. Other methodologies, such as the application of model order reduction to physically-based model are also available.

-	Asset state

    The state of the `asset` at a given instant is defined by a set of parameters. These parameters are obtained from the data collected by the sensors and from some evolution model. It is important to store in a database the historical evolution of the asset state so that they can be used in the development of digital twins.

-	Asset topics

    The communication protocols typically used in IOT technologies (MQTT, Apache Kafka and Apache Pulsar) use the term topic to refer to the text string used to filter the messages that a publisher sends to the receivers.
    It is necessary to store in database a list of the different topics used to send data related with the assets.

-	Product list
-	Product tracking
-	Supplies management



</p>
</details>



<details>
<summary> The Role System  </summary> 
<p>
For a more extensive documentation visit [![Link:roles](https://img.shields.io/badge/Roles-Manual-blue?style=flat&logo=GitBook&logoColor=blue&link=LINK)](./docs/roles.md).

![img:glossary:roles:general](./docs/img/role_general.png)





</p>
</details>




## Usage

(DTM, Dashboard, Node-red)

### Login

### Dashboard

### Digital Twin Model

### Node-RED




## Contributing
We welcome contributions to OSI4IOT. Please read [CONTRIBUTING.md](https://github.com/%3Cyour_username%3E/OSI4IOT/blob/master/CONTRIBUTING.md) for more information.

## Acknowledgements

## License
This project is licensed under the MIT License - see the [LICENSE](https://github.com/%3Cyour_username%3E/OSI4IOT/blob/master/LICENSE) file for details.

<!-- ## Test -->


## Examples