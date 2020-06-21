
let redraw = () => {};

const hierarchyMain = (dataLocationBaseName) => {

    const isNumber = obj => typeof(obj)==='number';
    const sum = inputArray => inputArray.reduce((a, b) => a + b, 0);
    const mean = inputArray => sum(inputArray) / inputArray.length;
    
    const plotContainer = document.getElementById('hierarchy');
    const svg = d3.select('#hierarchy-svg');
    const textDisplayDOMElement = document.getElementById('text-display');
    
    const svgZoomableContent = svg.append('g');
    const zoom = d3.zoom().on('zoom', () => {
        svgZoomableContent
            .attr('transform', d3.event.transform);
    });
    svg.call(zoom);
    
    d3.select('#text-display').html('');

    const alphaDecay = 0.001;
    const velocityDecay = 0.1;
    const distanceToCenterAlpha = 1.0;
    const linkAlpha = 0.1;
    const siblingAlpha = 0.25;

    const paddingBetweenNodes = 10;
    const approximateCircumferenceDistancePerNode = 20;
    const minDistanceBetweenDepths = 20;

    const simulation = d3.forceSimulation()
	  .alphaDecay(alphaDecay)
	  .velocityDecay(velocityDecay);
    const drag = d3.drag();
    
    const render = (inputArgs) => {

        const {nodeData, linkData, rootNode, nodeById, parentIdToChildIds, childIdToParentids, distanceToCenterFactorByDepth} = inputArgs;
        
        svg
	    .attr('width', `${0}px`)
	    .attr('height', `${0}px`)
	    .attr('width', `${plotContainer.clientWidth}px`)
	    .attr('height', `${plotContainer.clientHeight}px`);
        svgZoomableContent
	    .selectAll('*')
	    .remove();

        const htmlTextForNode = datum => `
<p>Label: ${datum.label} </p>
<p>Description: ${datum.description} </p>
<p>Number of Subclasses: ${parentIdToChildIds[datum.id].length} </p>
<p>Number of Instances: ${datum.number_of_instances} </p>
<p>Wikidata ID: <a target="_blank" title="${datum.label}"href="https://www.wikidata.org/wiki/${datum.id.replace('wd:','')}">${datum.id}</a></p>
` + (datum.image_url ? `<p><img style="max-height: ${textDisplayDOMElement.clientHeight * 0.8}px; max-width: ${textDisplayDOMElement.clientWidth * 0.8}px" src="${datum.image_url}" alt=""></p>` : '');
        
        d3.select('#text-display').html(htmlTextForNode(rootNode));
        
	const svgWidth = parseFloat(svg.attr('width'));
	const svgHeight = parseFloat(svg.attr('height'));

        nodeData.forEach((datum, index) => {
            if ( !('x' in datum && 'y' in datum)) {
                switch(index % 4) {
                case 0:
                    datum.x = 0;
                    datum.y = (index+1) / nodeData.length * svgHeight;
                    break;
                case 1:
                    datum.x = svgWidth;
                    datum.y = (index+1) / nodeData.length * svgHeight;
                    break;
                case 2:
                    datum.x = (index+1) / nodeData.length * svgWidth;
                    datum.y = 0;
                    break;
                case 3:
                    datum.x = (index+1) / nodeData.length * svgWidth;
                    datum.y = svgHeight;
                    break;
                }
            }
        });
        
        const edgeGroup = svgZoomableContent.append('g');
        const edgeDataJoin = edgeGroup
	      .selectAll('line')
	      .data(linkData.filter(datum => nodeById[datum.parent].displayEnabled && nodeById[datum.child].displayEnabled));
	const edgeEnterSelection = edgeDataJoin
	      .enter()
              .append('line');
        const updateEdges = () => {
            [edgeDataJoin, edgeEnterSelection].map(selection => {
                selection
	            .attr('class', datum => nodeById[datum.child].distance_to_root - nodeById[datum.parent].distance_to_root > 1 ? 'indirect-edge' : 'direct-edge')
                    .on('mouseover', function(datum) {
                        if (d3.select(this).classed('direct-edge')) {
                            d3.select(this).attr('class', 'direct-edge direct-edge-highlighted');
                        }
                        if (d3.select(this).classed('indirect-edge')) {
                            d3.select(this).attr('class', 'indirect-edge indirect-edge-highlighted');
                        }
                        const parent = nodeById[datum.parent];
                        const child = nodeById[datum.child];
                        d3.select('#text-display')
                            .html(`
<p>Parent:</p>
${htmlTextForNode(parent)}
</br>
<p>Child:</p>
${htmlTextForNode(child)}
`,);
                    })
                    .on('mouseout', function(d) {
                        if (d3.select(this).classed('direct-edge direct-edge-highlighted')) {
                            d3.select(this).attr('class', 'direct-edge');
                        }
                        if (d3.select(this).classed('indirect-edge indirect-edge-highlighted')) {
                            d3.select(this).attr('class', 'indirect-edge');
                        }
                    });
            });
        };
        updateEdges();

        const nodeGroup = svgZoomableContent.append('g');
	const nodeDataJoin = nodeGroup
	      .selectAll('circle')
	      .data(nodeData.filter(datum => datum.displayEnabled));
        const nodeEnterSelection = nodeDataJoin
	      .enter()
              .append('circle');
        const updateNodes = () => {
            [nodeDataJoin, nodeEnterSelection].map(selection => {
                nodeEnterSelection
                    .attr('class', datum => parentIdToChildIds[datum.id].filter(childId => nodeById[childId].distance_to_root - datum.distance_to_root == 1).length > 0 ? 'node node-expandable' : 'node node-leaf')
                    .on('mouseover', datum => {
                        d3.select('#text-display')
                            .html(htmlTextForNode(datum));
                    })
                    .on('click', datum => {
                        const children = parentIdToChildIds[datum.id].map(childId => nodeById[childId]);
                        if (children.length > 0) {
                            const xDelta = datum.x - rootNode.x;
                            const yDelta = datum.y - rootNode.y;
                            const immediateChildren = children.filter(child => child.distance_to_root == datum.distance_to_root + 1);
                            if (immediateChildren.every(child => child.displayEnabled)) {
                                const remainingChildren = [];
                                remainingChildren.push(...immediateChildren.filter(child => {
                                    const otherParents = childIdToParentids[child.id].filter(parentId => parentId !== datum.id).map(otherParentId => nodeById[otherParentId]);
                                    const otherImmediateParents = otherParents.filter(otherParent => otherParent.distance_to_root == child.distance_to_root + 1);
                                    const otherDisplayedImmediateParents = otherImmediateParents.filter(otherParent => otherParent.displayEnabled);
                                    return otherDisplayedImmediateParents.length === 0;
                                }));
                                while (remainingChildren.length > 0) {
                                    const child = remainingChildren.pop();
                                    child.displayEnabled = false;
                                    const grandChildren = parentIdToChildIds[child.id].map(grandChildId => nodeById[grandChildId])
                                          .filter(grandChild => grandChild.displayEnabled)
                                          .filter(grandChild => grandChild.distance_to_root == child.distance_to_root + 1)
                                          .filter(grandChild => {
                                              const parentsOfGrandChild = childIdToParentids[grandChild.id].map(grandChildId => nodeById[grandChildId]);
                                              const immediateParentsOfGrandChild = parentsOfGrandChild.filter(parentOfGrandChild => parentOfGrandChild.distance_to_root == grandChild.distance_to_root + 1);
                                              const displayedImmediateParentsOfGrandChild = immediateParentsOfGrandChild.filter(parentOfGrandChild => parentOfGrandChild.displayEnabled);
                                              const grandChildHasNoDisplayedParent = displayedImmediateParentsOfGrandChild.length === 0;
                                              return grandChildHasNoDisplayedParent;
                                          });
                                    remainingChildren.push(...grandChildren);
                                };
                            } else {
                                immediateChildren.forEach(child => {
                                    child.displayEnabled = true;
                                    if (datum !== rootNode) {
                                        child.x = datum.x + xDelta;
                                        child.y = datum.y + yDelta;
                                    }
                                });
                            }
                            render(inputArgs);
                        }
                    });
            });
        };
        updateNodes();

        const distanceToCenter = alpha => {
            return () => {
	        nodeData.filter(datum => datum.displayEnabled).forEach(datum => {
                    if (datum !== rootNode) {
                        const goalDistance = distanceToCenterFactorByDepth[datum.distance_to_root];
                        const xDelta = rootNode.x - datum.x;
                        const yDelta = rootNode.y - datum.y;
                        const currentDistance = Math.sqrt(xDelta * xDelta + yDelta * yDelta);
                        const oldPortionToKeep = 1 - ((currentDistance - goalDistance) / currentDistance) * alpha;
                        datum.x = datum.x * oldPortionToKeep + (1-oldPortionToKeep) * rootNode.x;
		        datum.y = datum.y * oldPortionToKeep + (1-oldPortionToKeep) * rootNode.y;
	            }
                });
            };
        };
        
        const linkForce = alpha => {            
            return () => {
	        nodeData.filter(datum => datum.displayEnabled).forEach(child => {
                    if (child !== rootNode) {
		        const parentIds = childIdToParentids[child.id];
                        const parents = parentIds.map(parentId => nodeById[parentId]).filter(parent => (child.distance_to_root - parent.distance_to_root) == 1);
                        const parentMeanX = mean(parents.map(parent => parent.x));
                        const parentMeanY = mean(parents.map(parent => parent.y));
                        child.x = child.x * (1-alpha) + alpha * parentMeanX;
                        child.y = child.y * (1-alpha) + alpha * parentMeanY;
                    }
                });
            };
        };
        
        const siblingForce = alpha => {            
            return () => {
	        nodeData.filter(datum => datum.displayEnabled).forEach(parent => {
                    const siblings = parentIdToChildIds[parent.id]
                          .filter(childId => nodeById[childId].displayEnabled)
                          .map(childId => childIdToParentids[childId])
                          .reduce((a,b) => a.concat(b), [])
                          .filter(siblingId => siblingId !== parent.id)
                          .map(siblingId => nodeById[siblingId])
                          .filter(sibling => sibling.distance_to_root == parent.distance_to_root)
                          .filter(sibling => sibling.displayEnabled);
                    if (siblings.length > 0) {
                        const siblingMeanX = mean(siblings.map(sibling => sibling.x)); 
                        const siblingMeanY = mean(siblings.map(sibling => sibling.y));
                        
                        parent.x = parent.x * (1-alpha) + alpha * siblingMeanX;
                        parent.y = parent.y * (1-alpha) + alpha * siblingMeanY;
                    }
                });
            };
        };

        drag.on("drag", (d,i) => {
            d.x += d3.event.dx;
            d.y += d3.event.dy;
        });

	simulation
            .force('center', d3.forceCenter(svgWidth / 2, svgHeight / 2))
            .force('links', linkForce(linkAlpha))
            .force('sibling-force', siblingForce(siblingAlpha))
            .force('distance-to-center', distanceToCenter(distanceToCenterAlpha))
            .force('collide', d3.forceCollide(paddingBetweenNodes).strength(0.5).iterations(200))
	    .nodes(nodeData.filter(datum => datum.displayEnabled)).on('tick', () => {
		nodeEnterSelection
		    .attr('cx', datum => datum.x)
		    .attr('cy', datum => datum.y)
                    .call(drag);
		edgeEnterSelection
		    .attr('x1', datum => nodeById[datum.parent].x)
		    .attr('y1', datum => nodeById[datum.parent].y)
		    .attr('x2', datum => nodeById[datum.child].x)
		    .attr('y2', datum => nodeById[datum.child].y);
	    })
	    .restart();
    };

    const generateDistanceToCenterFactorByDepth = nodeData => {
        const nodesPerDepth = nodeData.reduce((accumulator, node) => {
            if (node.distance_to_root in accumulator) {
                accumulator[node.distance_to_root] += 1;
            } else {
                accumulator[node.distance_to_root] = 1;
            }
            return accumulator;
        }, {});
        const distanceToCenterFactorByDepth = Object.keys(nodesPerDepth).reduce((accumulator, depth) => {
            const nodeCount = nodesPerDepth[depth];
            const approximateCircumference = nodeCount * approximateCircumferenceDistancePerNode;
            const expectedRadius = approximateCircumference / (2 * Math.PI);
            accumulator[depth] = Math.max(minDistanceBetweenDepths, expectedRadius);
            return accumulator;
        }, {});
        Object.keys(distanceToCenterFactorByDepth).sort().reduce((currentDistanceFromRoot, depth) => {
            distanceToCenterFactorByDepth[depth] += currentDistanceFromRoot;
            currentDistanceFromRoot = distanceToCenterFactorByDepth[depth];
            return currentDistanceFromRoot;
        }, 0);
        return distanceToCenterFactorByDepth;
    };
    
    const dataLocation = `./${dataLocationBaseName}_data.json`;
    d3.json(dataLocation)
	.then(data => {
	    const nodeData = data.nodes.map(datum => Object.assign(datum, {displayEnabled: datum.distance_to_root == 0}));
	    const linkData = data.links;
            const rootNode = nodeData.filter(datum => datum.distance_to_root == 0)[0];
	    const nodeById = nodeData.reduce((accumulator, node) => {
		accumulator[node.id] = node;
                return accumulator;
            }, {});
	    const { parentIdToChildIds, childIdToParentids } = linkData.reduce((accumulator, datum) => {
                ['parent', 'child'].forEach(datumKey => {
                    ['parentIdToChildIds', 'childIdToParentids'].forEach(accumulatorKey => {
                        if (! (datum[datumKey] in accumulator[accumulatorKey]) ) {
		            accumulator[accumulatorKey][datum[datumKey]] = [];
                        }
                    });
                });
	    	accumulator.parentIdToChildIds[datum.parent].push(datum.child);
	    	accumulator.childIdToParentids[datum.child].push(datum.parent);
                return accumulator;
	    }, {parentIdToChildIds: {}, childIdToParentids: {}});
            const distanceToCenterFactorByDepth = generateDistanceToCenterFactorByDepth(nodeData);
            window.removeEventListener('resize', redraw);
            redraw = () => {
                render({
                    nodeData,
                    linkData,
                    rootNode,
                    nodeById,
                    parentIdToChildIds,
                    childIdToParentids,
                    distanceToCenterFactorByDepth
                });
            };
	    redraw();
            window.addEventListener('resize', redraw);
	}).catch(err => {
	    console.error(err.message);
	    return;
	});
};

const runAIVisualization = () => {
    window.location.hash='#ai';
    location.reload();
};

const runCoronaryArteryDiseaseVisualization = () => {
    window.location.hash='#coronary_artery_disease';
    location.reload();
};

const runCrimeVisualization = () => {
    window.location.hash='#crime';
    location.reload();
};

const runEngineerVisualization = () => {
    window.location.hash='#engineer';
    location.reload();
};

const runFinancialServicesVisualization = () => {
    window.location.hash='#financial_services';
    location.reload();
};

const runMilitaryAircraftVisualization = () => {
    window.location.hash='#military_aircraft';
    location.reload();
};

const runVisualization = () => {
    const validDatasetNames = ['ai', 'coronary_artery_disease', 'crime', 'engineer', 'financial_services', 'military_aircraft'];
    const specifiedDatasetName = window.location.hash.slice(1);
    if (validDatasetNames.includes(specifiedDatasetName)) {
        hierarchyMain(specifiedDatasetName);
    } else {
        runMilitaryAircraftVisualization();
    }
};

const toggleHelp = () => {
    document.getElementById('help-display').classList.toggle('hide');
};

