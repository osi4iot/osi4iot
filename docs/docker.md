# Docker 

[![Logo:Docker](https://inlab.fib.upc.edu/sites/default/files/styles/large/public/field/image/docker_0.png)](https://www.docker.com/)

[![Docker](https://img.shields.io/badge/Docker-gray?style=flat&logo=docker&link=https://www.docker.com/)](https://www.docker.com/)

The platform runs using Docker. Docker is an innovative open platform for developing, shipping and running applications. It allows to separate the applications from the architecture that runs it, making the OSI4IOT easily portable to any OS.
To install Docker, refer to their website https://www.docker.com/ , and install the Docker Desktop for your OS.



___
___
___
___
___
___
___
___
___
___
___
___
___
___
___
___
Start updating and upgrading the Ubuntu.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$
pi@ubuntu:~$</div><div  style="width:fit-content;">sudo apt-get update
sudo apt-get upgrade</div></div></code></pre>

Install the following libraries.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo apt-get install ca-certificates curl gnupg lsb-release
</div></div></code></pre>

<figure markdown >
<center>
    <table class="figure-table"  style="width:50%"  >
    <tr >
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image109.png)</td>
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image110.png)</td>
    </tr>
    </table>
    <figcaption>Installing different libraries for Docker.</figcaption>
</center>
</figure>

Download the following dependencies.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$
pi@ubuntu:~$</div><div  style="width:fit-content;">sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
</div></div></code></pre>

<figure markdown >
<center>
    <table class="figure-table"  style="width:50%"  >
    <tr >
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image111.png)</td>
    </tr>
    </table>
    <figcaption>Downloading Docker.</figcaption>
</center>
</figure>

Execute the following command.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
</div></div></code></pre>


<figure markdown >
<center>
    <table class="figure-table"  style="width:50%"  >
    <tr >
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image112.png)</td>
    </tr>
    </table>
    <figcaption>Installing different libraries for Docker.</figcaption>
</center>
</figure>

And update the OS.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo apt-get upgrade</div></div></code></pre>

<figure markdown >
<center>
    <table class="figure-table"  style="width:50%"  >
    <tr >
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image113.png)</td>
    </tr>
    </table>
    <figcaption>Updating the OS.</figcaption>
</center>
</figure>

Now install docker.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin</div></div></code></pre>

<figure markdown >
<center>
    <table class="figure-table"  style="width:50%"  >
    <tr >
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image114.png)</td>
    </tr>
    </table>
    <figcaption>Install Docker.</figcaption>
</center>
</figure>

Start docker and check that the ***Hello World*** test works.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$
pi@ubuntu:~$</div><div  style="width:fit-content;">sudo service docker start
sudo docker run hello-world</div></div></code></pre>

<figure markdown >
<center>
    <table class="figure-table"  style="width:50%"  >
    <tr >
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image115.png)</td>
    </tr>
    </table>
    <figcaption>Start and test Docker.</figcaption>
</center>
</figure>

It is necessary to install docker globally to run docker without sudo.

1. Add the **docker** group if it doesn't already exist (it will prompt for user password).
<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo groupadd docker</div></div></code></pre>
2. Add the connected user **$USER** to the docker group.
<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo gpasswd -a $USER docker</div></div></code></pre>
**IMPORTANT**: Log out and log back in so that your group membership is re-evaluated.
3. Restart the **docker** daemon.
<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo service docker restart</div></div></code></pre>
If you are on *Ubuntu 14.04-15.10*, use **docker.io** instead:
<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo service docker.io restart</div></div></code></pre>

<figure markdown >
<center>
    <table class="figure-table"  style="width:50%"  >
    <tr >
        <td style="background-color:#ffffff">![osi4iot:docker:1](img/image116.png)</td>
    </tr>
    </table>
    <figcaption>Docker is installed globally.</figcaption>
</center>
</figure>

## Docker Swarm Error

The following instruction is required when installing the osi4iot platform in the Raspberry Pi if an error related to **docker swarm** is prompted.

<pre class="bash">
<div>pi@ubuntu: ~</div>
<code class="bash"><div><div style="width:fit-content;">pi@ubuntu:~$</div><div  style="width:fit-content;">sudo apt install linux-modules-extra-raspi</div></div></code></pre>
