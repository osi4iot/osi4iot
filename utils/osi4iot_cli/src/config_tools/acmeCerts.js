import fs from 'fs';
import clc from 'cli-color';
import { execSync } from 'child_process';
import os from 'os';

export default async function (osi4iotState) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const limitTimestamp = currentTimestamp + 3600 * 24 * 15; //15 days in sec of margin
    const domainName = osi4iotState.platformInfo.DOMAIN_NAME;
    const homedir = os.homedir();
    const env = {
        ...process.env,
        AWS_ACCESS_KEY_ID: osi4iotState.platformInfo.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: osi4iotState.platformInfo.AWS_SECRET_ACCESS_KEY
    }

    const acmeDomainDir = `${homedir}/.acme.sh/${domainName}`;
    const acmeDomainDirEcc = `${homedir}/.acme.sh/${domainName}_ecc`;
    let extension = "";
    if (!(fs.existsSync(acmeDomainDir) || fs.existsSync(acmeDomainDirEcc))) {
        console.log(clc.green(`\nGenerating acme ssl certificates...`));
        try {
            execSync(`~/.acme.sh/acme.sh --issue --dns dns_aws -d ${domainName} --server letsencrypt --force`, { stdio: 'inherit', env });
            console.log("");
        } catch (err) {
            throw new Error(`Error generating acme ssl certificates`)
        }
    } else {
        const expirationCaCert = parseInt(osi4iotState.certs.domain_certs.ca_pem_expiration_timestamp, 10);
        const expirationSslCert = parseInt(osi4iotState.certs.domain_certs.cert_crt_expiration_timestamp, 10);
        if (expirationCaCert < limitTimestamp || expirationSslCert < limitTimestamp) {
            console.log(clc.green(`\nUpdating acme ssl certificates...`));
            try {
                execSync(`~/.acme.sh/acme.sh --renew -d ${domainName} --server letsencrypt --force`, { stdio: 'inherit', env });
                console.log("");
            } catch (err) {
                throw new Error(`Error renewing ssl certificates`)
            }
            osi4iotState.certs.domain_certs.ssl_ca_pem = "";
            osi4iotState.certs.domain_certs.ssl_cert_crt = "";
        }
    }

    if (fs.existsSync(acmeDomainDirEcc)) extension = "_ecc";
    const privateKeyFile = `${homedir}/.acme.sh/${domainName}${extension}/${domainName}.key`;
    if (fs.existsSync(privateKeyFile)) {
        if (osi4iotState.certs.domain_certs.private_key === "") {
            const privateKeyFileText = fs.readFileSync(privateKeyFile, 'UTF-8');
            osi4iotState.certs.domain_certs.private_key = privateKeyFileText;
        }
    } else {
        throw new Error(`The file ${privateKeyFile} not exist`)
    }

    const caCertFile = `${homedir}/.acme.sh/${domainName}${extension}/ca.cer`;
    if (fs.existsSync(caCertFile)) {
        if (osi4iotState.certs.domain_certs.ssl_ca_pem === "") {
            const caCertFileText = fs.readFileSync(caCertFile, 'UTF-8');
            osi4iotState.certs.domain_certs.ssl_ca_pem = caCertFileText;
        }
    } else {
        throw new Error(`The file ${caCertFile} not exist`)
    }

    const sslCertFile = `${homedir}/.acme.sh/${domainName}${extension}/${domainName}.cer`;
    if (fs.existsSync(sslCertFile)) {
        if (osi4iotState.certs.domain_certs.ssl_cert_crt === "") {
            const sslCertFileText = fs.readFileSync(sslCertFile, 'UTF-8');
            osi4iotState.certs.domain_certs.ssl_cert_crt = sslCertFileText;
        }
    } else {
        throw new Error(`The file ${sslCertFile} not exist`)
    }

}