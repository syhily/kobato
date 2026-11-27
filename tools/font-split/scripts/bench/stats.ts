export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('median of an empty sample')
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function spread(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('spread of an empty sample')
  }
  const middle = median(values)
  return middle === 0 ? 0 : (Math.max(...values) - Math.min(...values)) / middle
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export interface LinearFit {
  coefficients: number[]
  r2: number
}

export interface LinearRow {
  x: readonly number[]
  y: number
}

function solve(matrix: number[][], vector: readonly number[]): number[] {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index]!])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) {
        pivot = row
      }
    }
    ;[augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!]
    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue
      }
      const factor = augmented[row]![column]! / augmented[column]![column]!
      for (let cell = column; cell <= size; cell += 1) {
        augmented[row]![cell]! -= factor * augmented[column]![cell]!
      }
    }
  }
  return augmented.map((row, index) => row[size]! / row[index]!)
}

export function fitLinear(rows: readonly LinearRow[]): LinearFit {
  if (rows.length === 0) {
    throw new Error('linear fit of an empty sample')
  }
  const size = rows[0]!.x.length
  if (rows.some((row) => row.x.length !== size)) {
    throw new Error('linear fit needs equally sized predictors')
  }
  const zeros = (): number[] => Array.from({ length: size }, () => 0)
  const squares: number[][] = Array.from({ length: size }, zeros)
  const targets: number[] = zeros()
  for (const row of rows) {
    for (let i = 0; i < size; i += 1) {
      targets[i]! += row.x[i]! * row.y
      for (let j = 0; j < size; j += 1) {
        squares[i]![j]! += row.x[i]! * row.x[j]!
      }
    }
  }
  const coefficients = solve(squares, targets)
  const mean = sum(rows.map((row) => row.y)) / rows.length
  const total = sum(rows.map((row) => (row.y - mean) ** 2))
  const residual = sum(rows.map((row) => (row.y - sum(row.x.map((value, index) => value * coefficients[index]!))) ** 2))
  return { coefficients, r2: total === 0 ? 1 : 1 - residual / total }
}
