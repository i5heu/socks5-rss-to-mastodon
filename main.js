const url = require('url');
const http = require('http');
const https = require('https');
var FormData = require('form-data');
const fs = require('fs');
const SocksProxyAgent = require('socks-proxy-agent');
let Parser = require('rss-parser');
let parser = new Parser();
const commandLineArgs = require('command-line-args')


const optionDefinitions = [
    { name: 'rss-url', alias: 'r', type: String },
    { name: 'auth', alias: 'a', type: String },
    { name: 'proxy', alias: 'p', type: String },
];


const usrOptions = commandLineArgs(optionDefinitions)

// Use the SOCKS_PROXY env var if using a custom bind address or port for your TOR proxy:
const proxy = process.env.SOCKS_PROXY || 'socks5h://' + usrOptions.proxy;
console.log('Using proxy server %j', proxy);
// The default HTTP endpoint here is DuckDuckGo's v3 onion address:
const endpoint = usrOptions['rss-url'];
console.log('Attempting to GET %j', endpoint);
// Prepare options for the http/s module by parsing the endpoint URL:
let options = url.parse(endpoint);
const agent = new SocksProxyAgent(proxy);
// Here we pass the socks proxy agent to the http/s module:
options.agent = agent;
// Depending on the endpoint's protocol, we use http or https module:
const httpOrHttps = options.protocol === 'https:' ? https : http;
// Make an HTTP GET request:

httpOrHttps.get(options, res => {
    var body = '';

    res.on('data', function (chunk) {
        body += chunk;
    });

    res.on('end', async () => {
        let feed = await parser.parseString(body);

        for (const item of feed.items) {
            await handleItem(item)
        }

        console.log("Done");
    });
});

async function handleItem(item) {
    if (isAlreadyPosted(item)) return;

    if (200 == await postToMastodon(item))
        writePostInFile(item);
}

async function postToMastodon(item) {

    const formData = new FormData();

    let text = "Check out this article: " + "https://qr2tor.net/" + encodeURIComponent(item.link) + "\n" + item.title + "\n" + item.contentSnippet;
    text = text.slice(0, 498);
    text += "…";

    formData.append("status", text);

    const optionsMastodon = {
        hostname: 'mastodon.social',
        port: 443,
        path: '/api/v1/statuses',
        method: 'POST',
        agent: new SocksProxyAgent(proxy),
        headers: Object.assign(
            formData.getHeaders(),
            {
                'Authorization': 'Bearer ' + usrOptions.auth,
            })
    };

    console.log("POST: " + item.title);
    const req = https.request(optionsMastodon, res => { });

    formData.pipe(req);
    req.end();

    return new Promise((resolve, reject) => {
        req.on('response', function (res) {
            console.log(res.statusCode);
            if (res.statusCode == 200) {
                resolve(res.statusCode);
            } else {
                reject(res.statusCode);
            }
        });
    });
}

function isAlreadyPosted(item) {
    var data = fs.readFileSync('postedUrls.txt', 'utf8').toString();
    return data.includes(item.link);
}

function writePostInFile(item) {
    fs.writeFileSync('postedUrls.txt', item.link + "\n", { flag: 'a+' });
}