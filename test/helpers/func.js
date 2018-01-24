export function zip(rows) {
    return rows[0].map((_,c) => rows.map(row => row[c]));
}

export function assertBigNumberEqual(actual, expected, message=undefined) {
    assert(actual.eq(expected), "{2}expected {0}, but got: {1}".format(expected, actual,
        message ? message + ': ' : ''));
}
