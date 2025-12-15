node_version = exec_get('fnm current').trim()
if (node_version === `v${bootstrap.versions.node}`) {
    console.log(`skip fnm use because already ${node_version} is used`)
} else {
    exec(`fnm install ${bootstrap.versions.node}`);
    exec(`fnm use ${bootstrap.versions.node}`);
}
