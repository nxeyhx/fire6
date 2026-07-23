// 복도 전용 A* 탐색 알고리즘
(function () {
  function pointOf(node) {
    return window.SIM_MAP.sensors[node] || window.SIM_MAP.exits[node];
  }

  function routeKey(a, b) {
    return [a, b].sort().join("|");
  }

  function routePoints(a, b) {
    const custom = window.SIM_MAP.corridorRoutes?.[routeKey(a, b)];
    if (!custom) return [pointOf(a), pointOf(b)];

    const pa = pointOf(a);
    const first = custom[0];
    const forward =
      Math.hypot(first.x - pa.x, first.y - pa.y) < 0.01;

    return forward ? custom : [...custom].reverse();
  }

  function polylineDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y
      ) / 10;
    }
    return total;
  }

  function distance(a, b) {
    return polylineDistance(routePoints(a, b));
  }

  function buildGraph() {
    const graph = {};
    const add = (a, b) => {
      graph[a] ||= [];
      graph[a].push({ node: b, distance: distance(a, b) });
    };

    window.SIM_MAP.edges.forEach(([a, b]) => {
      add(a, b);
      add(b, a);
    });

    return graph;
  }

  const graph = buildGraph();

  function heuristic(node, goal) {
    const a = pointOf(node);
    const b = pointOf(goal);
    return Math.hypot(a.x - b.x, a.y - b.y) / 10;
  }

  function reconstruct(cameFrom, current) {
    const path = [current];
    while (cameFrom[current]) {
      current = cameFrom[current];
      path.unshift(current);
    }
    return path;
  }

  function aStar(start, goal, risks) {
    const open = new Set([start]);
    const cameFrom = {};
    const g = { [start]: 0 };
    const f = { [start]: heuristic(start, goal) };

    while (open.size > 0) {
      let current = [...open].reduce((best, node) =>
        (f[node] ?? Infinity) < (f[best] ?? Infinity) ? node : best
      );

      if (current === goal) {
        return { path: reconstruct(cameFrom, current), cost: g[current] };
      }

      open.delete(current);

      for (const edge of graph[current] || []) {
        const next = edge.node;
        const risk = next.startsWith("S") ? Number(risks[next] || 0) : 0;

        if (risk >= 95 && next !== start) continue;

        const riskCost = Math.pow(risk / 32, 2);
        const tentative =
          (g[current] ?? Infinity) + edge.distance + riskCost;

        if (tentative < (g[next] ?? Infinity)) {
          cameFrom[next] = current;
          g[next] = tentative;
          f[next] = tentative + heuristic(next, goal);
          open.add(next);
        }
      }
    }

    return null;
  }

  function findSafestExit(start, risks) {
    const results = Object.keys(window.SIM_MAP.exits)
      .map(exit => ({ exit, result: aStar(start, exit, risks) }))
      .filter(item => item.result);

    if (!results.length) return null;

    results.sort((a, b) => a.result.cost - b.result.cost);
    return { exit: results[0].exit, ...results[0].result };
  }

  function expandPath(path) {
    if (!path || path.length < 2) return [];

    const result = [];

    for (let i = 1; i < path.length; i++) {
      const segment = routePoints(path[i - 1], path[i]);
      if (i > 1) segment.shift();
      result.push(...segment);
    }

    return result;
  }

  function graphDistances(start) {
    const distances = { [start]: 0 };
    const queue = [start];

    while (queue.length) {
      const current = queue.shift();

      for (const edge of graph[current] || []) {
        if (!edge.node.startsWith("S")) continue;

        if (distances[edge.node] === undefined) {
          distances[edge.node] = distances[current] + 1;
          queue.push(edge.node);
        }
      }
    }

    return distances;
  }

  window.PathFinder = {
    findSafestExit,
    graphDistances,
    expandPath,
    routePoints
  };
})();
