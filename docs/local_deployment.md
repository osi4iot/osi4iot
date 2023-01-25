# Local Deployment 

## Init platform

The different entries found when the platform is initialize are:

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

* Platform name: 

    The name of the platform. By default:

        (OSI-DEMO)
* Domain name: 
    
    The url or webpage where the platform is hosted. In the example above:

        iot_fiber4yards_demo.org
* Platform motivational phrase:

    A catchy or motivational phrase that describes the platform. By default:

        (Open source integration for internet of things)
* Platform admin first name: 

    The first name of the administrator of the platform. In the example above:

        admin_f4y
* Platform admin last name: 

    The last name of the administrator of the platform. In the example above:

        demo
* Platform admin user name: 

    The user name of the administrator of the platform. In the example above:

        admin_f4y_demo
* Platform admin email: 

    The email of the administrator of the platform. In the example above:

        admin_f4y_demo@gmail.com

    The password of the email of the administrator will be required to authentificate inside the platform. 
* Min and Max longitude/latitude of the geographical zone of the platform:

    When successfully logged into the platform, the homescreen shows a map where the different organizations will appear. These four entries are used to indicate the 4 courners of the default view. It uses the coordinates of Spain by default:

        Min longitude of the geographical zone of the platform (-10.56884765625):
        Max longitude of the geographical zone of the platform (1.42822265625):
        Min latitude of the geographical zone of the platform (35.55010533588552):
        Max latitude of the geographical zone of the platform (44.134913443750726 ):
* Default time zone: 

    The preferred time zone. By default:

        Europe/Madrid
* Main organization:

    Define the name, acronym and location of the organization. The name and acronym are by default:

        Main organization name (My main org):
        Main organization acronym (MYORG):
    
    In the example above the location was:
    
        Main organization address: fake street, fake number
        Main organization city: fake city
        Main organization zip code: 00000
        Main organization state/province: fake province
        Main organization country: Spain

    The country selected has to be real and the first letter in capital.
* Telegram bot:

    There is the option to set a telegram bot to notify the different users from changes happening in the platform. The platform need three things to be configured: a bot token, a chat id and an invitation link. In the example above:

        Telegram boottoken for main organization default group: 
        Telegram chat id for main organization default group: -694425020
        Telegram invitation link for main organization default group: https://t.me/
* Number of node-red instances in main org:

    The number of node-red instances to be created in the platform. By defauilt:
    
        (3)
* Email account for platform notifications:

    This e-mail is used as notification service to the users inside a platform. The e-mail and password have to be a valid one. In the example above:

        admin_f4y_demo@gmail.com
    
* S3 storage bucket name: 

    The platform allows to store the data inside AWS S3 service and also locally using the [minio](http://minio.io) technology, which offers native export support to AWS S3. By default

        (osi-demo)
