node_version = exec_get('nvm current').trim()
if (node_version === `v${bootstrap.versions.node}`) {
    console.log(`skip nvm use because already ${node_version} is used`)
} else {
    exec(`nvm install ${bootstrap.versions.node}`);
    exec(`nvm use ${bootstrap.versions.node}`);
}
