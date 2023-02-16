using Distributed
using ProgressMeter



export AbstractAlgorithm, Stoppability, Stoppable, NotStoppable

"""
    AbstractAlgorithm{Q,A}

Types subtyping `AbstractAlgorithm` should be callable with the following signatures:
- `(algorithm::AbstractAlgorithm{Q,A})(problem::Any) where {Q,A}` the initialization step that create the first query iterate `q::Q` 
- `(algorithm::AbstractAlgorithm{Q,A})(q::Q, problem::Any) where {Q,A}` is the step perfromed by the wokers when they receive a query `q::Q` from the central node
- `(algorithm::AbstractAlgorithm{Q,A})(a::A, worker::Int64, problem::Any) where {Q,A}` is the step performed by the central node when receiving an answer `a::A` from a worker
- when [`start`](@ref) takes the keyword `synchronous=true`, `(algorithm::AbstractAlgorithm{Q,A})(as::Vector{A}, workers::Vector{Int64}, problem::Any) where {Q,A}` is the step performed by the central node when receiving the answers `as::Vector{A}` from all the workers in `pids`

They can additionally define:
- `AsynchronousIterativeAlgorithms.stopnow(algorithm::MyAlgorithm)` (with the trait `AsynchronousIterativeAlgorithms.Stoppability(::MyAlgorithm) = Stoppable()`) to add a stopping condition to [`start`](@ref)'s (iterations, epochs, time) stopping condition
"""
abstract type AbstractAlgorithm{Q,A} end

mutable struct RecordedAlgorithm{Q,A} <: AbstractAlgorithm{Q,A}

    algorithm::AbstractAlgorithm{Q,A}

    iteration::Int64
    epoch::Int64 
    time::Float64
    precision::Float64
    precision_active::Bool
    last_query::Union{Q, UndefInitializer}
    iterations::Vector{Int64}
    epochs::Vector{Int64}
    timestamps::Vector{Float64}
    precisions::Vector{Float64}

    queries::Vector{Q}
    answers::Vector{A}
    save_answers::Bool
    answer_count::Dict{Int64, Int64}
    answers_origin::Vector{Int64}
    
    start_time::Float64
    progress_meter::Progress
    stopat::Union{Tuple{Int64, Int64, Float64}, Tuple{Int64, Int64, Float64, Float64}}
    saveat::Tuple{Int64, Int64}
    distance::Function
    verbose::Int64
    
    function RecordedAlgorithm{Q,A}(algorithm::AbstractAlgorithm{Q,A}, copy::Bool, stopat::Union{Tuple{Int64, Int64, Float64}, Tuple{Int64, Int64, Float64, Float64}}, saveat::Tuple{Int64, Int64}, pids::Vector{Int64}, save_answers::Bool, distance::Function, verbose::Int64) where {Q,A}
        copy && (algorithm = deepcopy(algorithm))
        iterations = Vector{Int64}()
        epochs = Vector{Int64}()
        timestamps = Vector{Float64}()
        precisions = Vector{Float64}()
        queries = Vector{Q}()
        answers = Vector{A}()
        answer_count = Dict(pids .=> 0)
        answers_origin = Vector{Int64}()
        iteration = 0
        epoch = 0
        time = 0.
        precision_active = length(stopat)==4
        precision = Inf
        last_query = undef
        start_time = 0.
        progress_meter = Progress(100; desc="Iterating:", showspeed=true, enabled=verbose>0)

        new{Q,A}(algorithm, iteration, epoch, time, precision, precision_active, last_query, iterations, epochs, timestamps, precisions, queries, answers, save_answers, answer_count, answers_origin, start_time, progress_meter, stopat, saveat, distance, verbose)
    end
end


"""
Initialise
"""
function (ra::RecordedAlgorithm{Q,A})(problem::Any) where {Q,A}
    q = ra.algorithm(problem)
    ra.iteration = 1
    ra.epoch = 1 
    ra.start_time = time_ns()
    ra.time = 0.
    append!(ra.queries, [copy(q)])
    append!(ra.iterations, [ra.iteration])
    append!(ra.epochs, [ra.epoch])
    append!(ra.timestamps, [ra.time])
    ra.precision_active && append!(ra.precisions, [ra.precision])
    ra.precision_active && (ra.last_query = q)
    return q
end

"""
Asynchronous central iteration 
"""
function (ra::RecordedAlgorithm{Q,A})(a::A, worker::Int64, problem::Any) where {Q,A}
    q = ra.algorithm(a, worker, problem)
    ra.answer_count[worker] += 1
    ra.iteration += 1
    ra.time = (time_ns() - ra.start_time)/1e9
    ra.precision_active && (ra.precision = ra.distance(q, ra.last_query); ra.last_query = q)
    all(values(ra.answer_count) .>= ra.epoch) && (ra.epoch += 1)
    update!(ra.progress_meter, progress(ra), showvalues = generate_showvalues(ra))
    
    if savenow(ra) || stopnow(ra)
        append!(ra.queries, [copy(q)])
        append!(ra.iterations, [ra.iteration])
        append!(ra.epochs, [ra.epoch])
        append!(ra.timestamps, [ra.time])
        if ra.precision_active 
            append!(ra.precisions, [ra.precision])
        elseif ra.save_answers
            append!(ra.answers, [copy(a)])
            append!(ra.answers_origin, [worker])
            ra.precision_active && append!(ra.precisions, [ra.precision])
        end 
    end
    return q
end

"""
Synchronous central iteration 
"""
function (ra::RecordedAlgorithm{Q,A})(as::Vector{A}, workers::Vector{Int}, problem::Any) where {Q,A}
    q = ra.algorithm(as, workers, problem)
    foreach((worker)->ra.answer_count[worker] += 1, keys(ra.answer_count))
    ra.iteration += 1
    ra.epoch += 1
    ra.time = (time_ns() - ra.start_time)/1e9
    ra.precision_active && (ra.precision = ra.distance(q, ra.last_query); ra.last_query = q)
    update!(ra.progress_meter, progress(ra), showvalues = generate_showvalues(ra))

    if savenow(ra) || stopnow(ra)
        append!(ra.queries, [copy(q)])
        append!(ra.iterations, [ra.iteration])
        append!(ra.epochs, [ra.epoch])
        append!(ra.timestamps, [ra.time])
        if ra.precision_active 
            append!(ra.precisions, [ra.precision])
        elseif ra.save_answers
            append!(ra.answers, copy(as))
            append!(ra.answers_origin, workers)
        end 
    end
    q
end

"""
Worker iteration 
"""
function (ra::RecordedAlgorithm{Q,A})(q::Q, problem::Any) where {Q,A}
    ra.algorithm(q, problem)
end

"""
Return true if the saving condition has been reached
"""
function savenow(ra::RecordedAlgorithm{Q,A}) where {Q,A}
    (ra.saveat[1] ≠ 0 && (ra.iteration % ra.saveat[1] == 0)) || 
    (ra.saveat[2] ≠ 0 && (ra.epoch % ra.saveat[2] == 0))
end

"""
How close the current step is to reaching the stopping requirement on a scale of 1 to 100  
"""
function progress(ra::RecordedAlgorithm{Q,A}) where {Q,A}
    stopnow(ra) && return 100
    output = 0.
    ra.stopat[1] == 0 || (output += ra.iteration / ra.stopat[1])
    ra.stopat[2] == 0 || (output += ra.epoch / ra.stopat[2])
    ra.stopat[3] == 0. || (output += ra.time / ra.stopat[3])    
    output *= 99 / count(≠(0), ra.stopat)
    ceil(Int64, output)
end

abstract type Stoppability end
struct Stoppable <: Stoppability end
struct NotStoppable <: Stoppability end
Stoppability(::AbstractAlgorithm) = NotStoppable()
"""
Return true if the stopping condition has been reached
"""
stopnow(ra::RecordedAlgorithm) = stopnow(Stoppability(ra.algorithm), ra)
stopnow(::Stoppable, ra::RecordedAlgorithm) = stopnow(ra.algorithm) || stopnow(NotStoppable(), ra)
function stopnow(::NotStoppable, ra::RecordedAlgorithm)
    (ra.stopat[1] ≠ 0 && ra.iteration ≥ ra.stopat[1]) || 
    (ra.stopat[2] ≠ 0 && ra.epoch ≥ ra.stopat[2]) || 
    (ra.stopat[3] ≠ 0 && ra.time ≥ ra.stopat[3]) || 
    (ra.precision_active && ra.iteration > 1 && ra.precision ≤ ra.stopat[4])
end

"""
Function used in `record` as an argument of `ProgressMeter.next!`
"""
function generate_showvalues(ra::RecordedAlgorithm)
    () -> append!([(:iterations, ra.iteration), (:epochs, ra.epoch), (:answers, string(ra.answer_count)[6:end-1])], ra.precision_active ? [(:precision, ra.precision)] : [])
end

"""
Compile the results to be outputed 
"""
function report(ra::RecordedAlgorithm)
    (queries=ra.queries, answers=ra.answers, iterations=ra.iterations, epochs=ra.epochs, timestamps=ra.timestamps, answers_origin=ra.answers_origin, answer_count=ra.answer_count, precision=ra.precisions)
end