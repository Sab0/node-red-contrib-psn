// psn.js
module.exports = function(RED) {
    function PSNNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const dgram = require('dgram');
        const Decoder = require('@jwetzell/posistagenet').Decoder;

        const client = dgram.createSocket('udp4');
        const decoder = new Decoder();
        
        let temp = {x: 0.0, y: 0.0, z: 0.0};
        let timer = null;

        // Configure the UDP client
        client.on('listening', () => {
            try {
                client.addMembership('236.10.10.10', config.interface || '0.0.0.0');
                node.status({fill: "green", shape: "dot", text: "listening"});
            } catch (err) {
                node.error("Failed to add membership: " + err.toString());
                node.status({fill: "red", shape: "ring", text: "error"});
            }
        });

        client.on('message', (buffer) => {
            try {
                decoder.decode(buffer);
                analyzeData();
            } catch (err) {
                node.error("Decode error: " + err.toString());
            }
        });

        function analyzeData() {
            Object.entries(decoder.trackers).forEach(([trackerId, tracker]) => {
                const trackerName = decoder.trackers[trackerId]?.tracker_name?.tracker_name;
                
                // Send all tracker data as a message
                const msg = {
                    payload: {
                        trackerId: trackerId,
                        name: trackerName,
                        position: tracker.pos ? {
                            x: tracker.pos.pos_x,
                            y: tracker.pos.pos_y,
                            z: tracker.pos.pos_z
                        } : null
                    },
                    topic: trackerName || trackerId
                };
                
                node.send(msg);

                // Special handling for Ice Legs Traveller 2 SR
                if (trackerName === "Ice Legs Traveller 2 SR" && tracker.pos) {
                    let changed = false;
                    const pos = tracker.pos;
                    
                    if (Math.abs(temp.x - pos.pos_x) > 1) {
                        changed = true;
                        temp.x = pos.pos_x;
                    }
                    if (Math.abs(temp.y - pos.pos_y) > 1) {
                        changed = true;
                        temp.y = pos.pos_y;
                    }
                    if (Math.abs(temp.z - pos.pos_z) > 1) {
                        changed = true;
                        temp.z = pos.pos_z;
                    }

                    if (changed) {
                        const status = `x:${temp.x.toFixed(3)} y:${temp.y.toFixed(3)} z:${temp.z.toFixed(3)}`;
                        node.status({fill: "blue", shape: "dot", text: status});
                        
                        if (timer) {
                            clearTimeout(timer);
                        }
                        timer = setTimeout(() => {
                            node.status({fill: "green", shape: "dot", text: "listening"});
                            timer = null;
                        }, 1000);
                    }
                }
            });
        }

        // Start listening
        try {
            client.bind(config.port || 56565, '0.0.0.0');
        } catch (err) {
            node.error("Bind error: " + err.toString());
            node.status({fill: "red", shape: "ring", text: "bind error"});
        }

        node.on('close', function(done) {
            if (timer) {
                clearTimeout(timer);
            }
            client.close();
            done();
        });
    }
    RED.nodes.registerType("psn", PSNNode);
}
