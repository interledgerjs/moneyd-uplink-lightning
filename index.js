"use strict";
const crypto = require("crypto");
const Plugin = require("ilp-plugin-lightning");
const { convert, Unit } = require("ilp-plugin-lightning/build/account");
const connectorList = require("./connector_list.json");
const util = require("util");
const parentBtpHmacKey = "parent_btp_uri";
const inquirer = require("inquirer");
const base64url = buf =>
  buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

async function configure({ testnet, advanced }) {
  const servers = connectorList[testnet ? "test" : "live"];
  const defaultParent = servers[Math.floor(Math.random() * servers.length)];
  const res = {};
  const fields = [
    {
      type: "input",
      name: "pubkey",
      message: "LND Pubkey:"
    },
    {
      type: "input",
      name: "host",
      message: "LND Host IP:"
    },
    {
      type: "input",
      name: "tlscert",
      message: "LND TLS Cert (Path to file or base64 stiring):"
    },
    {
      type: "input",
      name: "macaroon",
      message: "LND Admin Macaroon (Path to file or base64 stiring):"
    },
    {
      type: "input",
      name: "parent",
      message: "BTP host of parent connector:",
      default: defaultParent
    },
    {
      type: "input",
      name: "name",
      message: "Name to assign to this channel:",
      default: base64url(crypto.randomBytes(32))
    }
  ];
  for (const field of fields) {
    res[field.name] = (await inquirer.prompt(field))[field.name];
  }

  // create btp server uri for upstream
  const btpName = res.name || "";
  const btpSecret = hmac(
    hmac(parentBtpHmacKey, res.parent + btpName),
    res.pubkey
  ).toString("hex");
  const btpServer = "btp+wss://" + btpName + ":" + btpSecret + "@" + res.parent;

  return {
    relation: "parent",
    plugin: require.resolve("ilp-plugin-lightning"),
    assetCode: "BTC",
    assetScale: 8,
    sendRoutes: false,
    receiveRoutes: false,
    options: {
      role: "client",
      server: btpServer,
      lndIdentityPubkey: res.pubkey,
      lndHost: res.host,
      lnd: {
        tlsCertPath: res.tlscert,
        macaroonPath: res.macaroon,
        lndHost: res.host
      },
      balance: {
        maximum: convert(".0005", Unit.BTC, Unit.Satoshi),
        settleTo: convert(".0001", Unit.BTC, Unit.Satoshi),
        settleThreshold: convert("0.00009", Unit.BTC, Unit.Satoshi)
      }
    }
  };
}

const commands = [
  {
    command: "info",
    describe: "Get info about your lnd node",
    builder: {},
    handler: (config, argv) => makeUplink(config)._printInfo()
  }
  // {
  //   command: 'channels',
  //   describe: 'Get info about any channels you have with your connector',
  //   builder: {},
  //   handler: (con)
  // }
  // {
  //   command: 'getRoutes',
  //   describe: 'Get routing information between you and the connector',
  //   builder: {
  //     amount: {
  //       description: 'The amount (in satoshis) each route must contain.',
  //       demandOption: true
  //     }
  //   },
  //   handler: (config, {amount}) => makeUplink(config).getRoutes(amount)
  // }
];

function makeUplink(config) {
  return new LightningUplink(config);
}

class LightningUplink {
  constructor(config) {
    this.config = config;
    this.pluginOpts = config.options;
    this.plugin = null;
  }

  async _printInfo() {
    const api = await this.api();
    const info = await api.getInfo();
    console.log(util.inspect(object, { colors: true }));
  }

  async _api() {
    if (!this.plugin) {
      this.plugin = new Plugin(this.pluginOpts);
      await this.plugin.connect();
    }
    return this.plugin.lnd;
  }
}

function hmac(key, message) {
  const h = crypto.createHmac("sha256", key);
  h.update(message);
  return h.digest();
}

module.exports = {
  configure,
  commands
};
