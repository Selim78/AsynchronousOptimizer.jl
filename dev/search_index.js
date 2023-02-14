var documenterSearchIndex = {"docs":
[{"location":"manual/#Manual","page":"Manual","title":"Manual","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"We saw how to run an asynchronous version of the SGD algorithm on a LRMSE problem in quick start. Here we'll use this same example to look at the following:  ","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Working with a distributed problem\nSynchronous run\nActive processes\nRecording iterates\nCustom stopping criterion\nstart vs start!\nHandling worker failures\nAlgorithm templates","category":"page"},{"location":"manual/#Working-with-a-distributed-problem","page":"Manual","title":"Working with a distributed problem","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"Suppose you have a make_problem function","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"# Note: In this example we sample `A` and `b`. \n# In practice, we could read them from a file or any other source.\n@everywhere function make_problem(pid)\n    pid==1 && return nothing # for now, let's assign process 1 an empty problem\n    LRMSE(rand(pid,10),rand(pid)) # the sample size is `m` is set to `pid` for demonstration purposes only\nend","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"When instanciating your problems you might have three requirement:","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Limiting comunication costs and avoiding duplicated memory: loading problems directly on their assigned processes is be preferable to loading them central node before sending them to their respective processes\nPersistant data: necessary if you want to reuse problems for multiple experiments (you don't want your problems to be stuck on  remote processes in start's local scope)","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Depending on your needs, you have three options to construct your problems:","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"# Option 1: Instantiate the problems remotely\nproblem_constructor = make_problem \n\n# Option 2: Instantiate the problems on the central node and send them to their respective processes\nproblems = Dict(procs() .=> make_problem.(procs()));\nproblem_constructor = (pid) -> problems[pid]\n\n# Option 3: Create a `DistributedObject` that references a problem on each process. \n@everywhere using DistributedObjects\ndistributed_problem = DistributedObject((pid) -> make_problem(pid), pids=procs())","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Option 3 uses DistributedObjects. In a nutshell, a DistributedObject instance references at most one object per process, and you can access the object stored on the current process with []","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":" communication costs & duplicated memory single use objectives \nOption 1  ❌ (Image: )\nOption 2 ❌  (Image: )\nOption 3   (Image: )","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"As previously noted, Option 2 should be avoided when working with large data. However, it does offer the advantage of preserving access to problems, which is not possible with Option 1. This opens up the possibility of reconstructing the global problem.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"# reconstructing global problem from problems storred locally\nfunction LRMSE(problems::Dict)\n    pids = [pid for pid in keys(problems) if pid ≠ 1]\n    n = problems[pids[1]].n\n    m = sum([problems[pid].m for pid in pids])\n    L = sum([problems[pid].L for pid in pids])\n    ∇f(x) = sum([problems[pid].∇f(x) * problems[pid].m for pid in pids]) / m\n    return LRMSE(nothing,nothing,n,m,L,∇f)\nend\n\nproblems[1] = LRMSE(problems);\n# We now have access to the global Lipschitz constant!\nsgd = SGD(1/problems[1].L)","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Option 3 is the best of both worlds:","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"# reconstructing global problem from problems storred remotely \nfunction LRMSE(d::DistributedObject)\n    pids = [pid for pid in where(d) if pid ≠ 1]\n    n = fetch(@spawnat pids[1] d[].n)\n    m = sum(fetch.([@spawnat pid d[].m for pid in pids]))\n    L = sum(fetch.([@spawnat pid d[].L for pid in pids]))\n    ∇f(x) = sum(fetch.([@spawnat pid d[].∇f(x) * d[].m for pid in pids])) / m\n    return LRMSE(nothing,nothing,n,m,L,∇f)\nend\n\ndistributed_problem[] = LRMSE(distributed_problem);\n# We also have access to the global Lipschitz constant!\nsgd = SGD(1/distributed_problem[].L)","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"It's worth mentioning that instead of problem_constructor::Function, distributed_problem::DistributedObject can be passed to start. Both of the following are equivalent:","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"history = start(sgd, (pid)-> distributed_problem[], stopat)\nhistory = start(sgd, distributed_problem, stopat);","category":"page"},{"location":"manual/#Synchronous-run","page":"Manual","title":"Synchronous run","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"If you want to run your algorithm synchronously you just have to define the synchronous central step performed by the central node when receiving a answers as::Vector{A} from all the workers...","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"@everywhere begin\n    # synchronous central step\n    (sgd::SGD)(as::Vector{Vector{Float64}}, workers::Vector{Int64}, problem::Any) = sum(as)\nend","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"...and to add the synchronous=true keyword to start","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"history = start(sgd, distributed_problem, stopat; synchronous=true);","category":"page"},{"location":"manual/#Active-processes","page":"Manual","title":"Active processes","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"You can chose which processes are active with the pids keyword","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"history = start(sgd, problem_constructor, stopat; pids=[2,3,6]);","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"If pids=[1], a non-distributed (and necessarily synchronous) version of your algorithm will be started.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"history = start(sgd, (pid)->LRMSE(rand(42,10),rand(42)), stopat; pids=[1], synchronous=true);","category":"page"},{"location":"manual/#Recording-iterates","page":"Manual","title":"Recording iterates","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"The queries::Q sent by the central node are saved at intervals specified by saveat=(iterations, epochs).","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"history = start(sgd, distributed_problem, stopat; saveat=(10,0));","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"To also save the workers' answers::A, simply add the save_answers=true keyword.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"history = start(sgd, distributed_problem, stopat; saveat=(10,0), save_answers=true);","category":"page"},{"location":"manual/#Custom-stopping-criterion","page":"Manual","title":"Custom stopping criterion","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"To augment the default stopat=(iteration, epoch, time) with an additional stopping criterion, follow these steps:","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Define a new method AsynchronousIterativeAlgorithms.stopnow to be dispatched when called on your algorithm.\nDeclare that your algorithm implements the Stoppable trait.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"As an example, let's modify the SGD example to include a precision criterion.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"@everywhere begin\n    using LinearAlgebra\n\n    mutable struct CustomSGD<:AbstractAlgorithm{Vector{Float64},Vector{Float64}}\n        stepsize::Float64\n        previous_q::Vector{Float64}\n        gap::Float64 # will hold the distance between the last two iterates\n        precision::Float64\n        CustomSGD(stepsize::Float64, precision) = new(stepsize, Vector{Float64}(), 10^6, precision)\n    end\n    \n    function (sgd::CustomSGD)(problem::Any) \n        sgd.previous_q = rand(problem.n)\n    end\n    \n    function (sgd::CustomSGD)(q::Vector{Float64}, problem::Any)\n        sgd.stepsize * problem.∇f(q, rand(1:problem.m))\n    end\n    \n    function (sgd::CustomSGD)(a::Vector{Float64}, worker::Int64, problem::Any) \n        q = sgd.previous_q - a \n        sgd.gap = norm(q-sgd.previous_q)\n        sgd.previous_q = q\n    end\n\n    # Stop when gap is small enough\n    AIA.stopnow(sgd::CustomSGD) = sgd.gap ≤ sgd.precision\n    AIA.Stoppability(::CustomSGD) = Stoppable()    \nend\n\nhistory = start(CustomSGD(0.01, 0.1), distributed_problem, (10,0,0.));","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"This was only meant to be an example as in practice you can specify a precision threshold by passing a fourth value in stopat. To use a custom distance function instead of the default (x,y)->norm(x-y), provide the desired function through the distance keyword of start.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"history = start(CustomSGD(0.01, 0.1), distributed_problem, (10,0,0.,0.1); distance=(x,y)->norm(x-y,1));","category":"page"},{"location":"manual/#[start](@ref)-vs-[start!](@ref)","page":"Manual","title":"start vs start!","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"start uses a deep copy of your algorithm and won't modify it. To enable modifications (e.g. to record information during the execution), use start!.","category":"page"},{"location":"manual/#Handling-worker-failures","page":"Manual","title":"Handling worker failures","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"If you expect some workers to fail but still want the algorithm to continue running, you can set the resilience parameter to the maximum number of worker failures you can tolerate before the execution is terminated.","category":"page"},{"location":"manual/#algorithm_templates","page":"Manual","title":"Algorithm templates","text":"","category":"section"},{"location":"manual/","page":"Manual","title":"Manual","text":"You are free to create your own algorithms, but if you're interested in aggregation algorithms, you can use an implementation provided in this library. The iteration of such an algorithm performs the following computation:","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"q_j longleftarrow textrmquery(underseti in textrmconnectedtextrmaggregate(a_j))  textrmwhere   a_i = textrmanswer(q_i)","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"where q_j is computed by the worker upon reception of textrmanswer(q_i) from worker j and where connected are the list of workers that have answered.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"The AggregationAlgorithm in this library requires you to specify three methods: query, answer, and aggregate. Here's an example showing the required signatures of these three methods:","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"@everywhere begin \n    using Statistics\n\n    function agg_gd(q0, stepsize)\n        initialize(problem::Any) = q0\n        aggregate(a::Vector{Vector{Float64}}, connected::Vector{Int64}) = mean(a)            \n        query(a::Vector{Float64}, problem::Any) = a\n        answer(q::Vector{Float64}, problem::Any) = q - stepsize * problem.∇f(q)   \n\n        AggregationAlgorithm{Vector{Float64}, Vector{Float64}}(initialize, aggregate, query, answer; pids=workers())\n    end\nend \n\nhistory = start(agg_gd(rand(10), 0.01), distributed_problem, (1000,0,0.));","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Memory limitation: At any point in time, the central worker should have access must have access to the latest answers a_i from all the connected workers. This means storing a lot of a_i if we use many workers. There is a workaround when the aggregation operation is an average. In this case only the equivalent of one answer needs to be saved on the central node, regardless of the number of workers.","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"AveragingAlgorithm implements this memory optimization. Here you only need to define query, the answer","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"@everywhere begin \n    # If you want the average to be weighted, you can add the keywords pids with their corresponding weights\n    function avg_gd(q0, stepsize, pids=workers(), weights=ones(nworkers())) \n        initialize(problem::Any) = q0\n        query(a::Vector{Float64}, problem::Any) = a\n        answer(q::Vector{Float64}, problem::Any) =  q - stepsize * problem.∇f(q)\n        AveragingAlgorithm{Vector{Float64}, Vector{Float64}}(initialize, query, answer; pids=pids, weights=weights)\n    end\nend\n\nhistory = start(avg_gd(rand(10), 0.01), distributed_problem, (1000,0,0.));","category":"page"},{"location":"manual/","page":"Manual","title":"Manual","text":"Hope you find this library helpful and look forward to seeing how you put it to use!","category":"page"},{"location":"","page":"Home","title":"Home","text":"CurrentModule = AsynchronousIterativeAlgorithms","category":"page"},{"location":"#AsynchronousIterativeAlgorithms.jl","page":"Home","title":"AsynchronousIterativeAlgorithms.jl","text":"","category":"section"},{"location":"","page":"Home","title":"Home","text":"🧮AsynchronousIterativeAlgorithms.jl handles the distributed asynchronous communications, so you can focus on designing your algorithm.","category":"page"},{"location":"","page":"Home","title":"Home","text":"💽 It also offers a convenient way to manage the distribution of your problem's data across multiple processes or remote machines.","category":"page"},{"location":"#Installation","page":"Home","title":"Installation","text":"","category":"section"},{"location":"","page":"Home","title":"Home","text":"You can install AsynchronousIterativeAlgorithms by typing","category":"page"},{"location":"","page":"Home","title":"Home","text":"julia> ] add AsynchronousIterativeAlgorithms","category":"page"},{"location":"#quick_start","page":"Home","title":"Quick start","text":"","category":"section"},{"location":"","page":"Home","title":"Home","text":"Say you want to implement a distributed version of Stochastic Gradient Descent (SGD). You'll need to define:","category":"page"},{"location":"","page":"Home","title":"Home","text":"an algorithm structure subtyping AbstractAlgorithm{Q,A}\nthe initialisation step where you compute the first iteration \nthe worker step performed by the workers when they receive a query q::Q from the central node\nthe asynchronous central step performed by the central node when it receives an answer a::A from a worker","category":"page"},{"location":"","page":"Home","title":"Home","text":"(Image: Sequence Diagram)","category":"page"},{"location":"","page":"Home","title":"Home","text":"Let's first of all set up our distributed environement.","category":"page"},{"location":"","page":"Home","title":"Home","text":"# Launch multiple processes (or remote machines)\nusing Distributed; addprocs(5)\n\n# Instantiate and precompile environment in all processes\n@everywhere (using Pkg; Pkg.activate(@__DIR__); Pkg.instantiate(); Pkg.precompile())\n\n# You can now use AsynchronousIterativeAlgorithms\n@everywhere (using AsynchronousIterativeAlgorithms; const AIA = AsynchronousIterativeAlgorithms)","category":"page"},{"location":"","page":"Home","title":"Home","text":"Now to the implementation.","category":"page"},{"location":"","page":"Home","title":"Home","text":"# define on all processes\n@everywhere begin\n    # algorithm\n    mutable struct SGD<:AbstractAlgorithm{Vector{Float64},Vector{Float64}}\n        stepsize::Float64\n        previous_q::Vector{Float64} # previous query\n        SGD(stepsize::Float64) = new(stepsize, Vector{Float64}())\n    end\n\n    # initialisation step \n    function (sgd::SGD)(problem::Any)\n        sgd.previous_q = rand(problem.n)\n    end\n\n    # worker step\n    function (sgd::SGD)(q::Vector{Float64}, problem::Any) \n        sgd.stepsize * problem.∇f(q, rand(1:problem.m))\n    end\n\n    # asynchronous central step\n    function (sgd::SGD)(a::Vector{Float64}, worker::Int64, problem::Any) \n        sgd.previous_q -= a\n    end\nend","category":"page"},{"location":"","page":"Home","title":"Home","text":"Now let's test our algorithm on a linear regression problem with mean squared error loss (LRMSE). This problem must be compatible with your algorithm. In this example, it means providing attributes n and m (dimension of the regressor and number of points), and the method ∇f(x::Vector{Float64}, i::Int64) (gradient of the linear regression loss on the ith data point)","category":"page"},{"location":"","page":"Home","title":"Home","text":"@everywhere begin\n    struct LRMSE\n        A::Union{Matrix{Float64}, Nothing}\n        b::Union{Vector{Float64}, Nothing}\n        n::Int64\n        m::Int64\n        L::Float64 # Lipschitz constant of f\n        ∇f::Function\n    end\n\n    function LRMSE(A::Matrix{Float64}, b::Vector{Float64})\n        m, n = size(A)\n        L = maximum(A'*A)\n        ∇f(x) = A' * (A * x - b) / n\n        ∇f(x,i) = A[i,:] * (A[i,:]' * x - b[i])\n        LRMSE(A, b, n, m, L, ∇f)\n    end\nend","category":"page"},{"location":"","page":"Home","title":"Home","text":"We're almost ready to start the algorithm...","category":"page"},{"location":"","page":"Home","title":"Home","text":"# Provide the stopping criteria \nstopat = (1000,0,0.) # (iterations, epochs, time)\n\n# Instanciate your algorithm \nsgd = SGD(0.01)\n\n# Create a function that returns an instance of your problem for a given pid \nproblem_constructor = (pid) -> LRMSE(rand(42,10),rand(42))\n\n# And you can [start](@ref)!\nhistory = start(sgd, problem_constructor, stopat);","category":"page"},{"location":"documentation/#Documentation","page":"Documentation","title":"Documentation","text":"","category":"section"},{"location":"documentation/#start-and-start!","page":"Documentation","title":"start and start!","text":"","category":"section"},{"location":"documentation/","page":"Documentation","title":"Documentation","text":"start","category":"page"},{"location":"documentation/#AsynchronousIterativeAlgorithms.start","page":"Documentation","title":"AsynchronousIterativeAlgorithms.start","text":"start(algorithm::AbstractAlgorithm{Q,A}, problem_constructor::Function, stopat::Union{Tuple{Int64, Int64, Float64}, Tuple{Int64, Int64, Float64, Float64}}; saveat=(0,0), save_answers=false, pids=workers(), synchronous=false, distance::Function=(x::Q,y::Q)->norm(x-y), resilience=0, verbose=1) where {Q,A}\n\nSolve the distributed problem returned by problem_constructor using the algorithm.\n\nArguments\n\nalgorithm::AbstractAlgorithm{Q,A}: subtyping AbstractAlgorithm{Q,A} and implementing its functor calls\nproblem_constructor::Function: this function should return the process pid's problem when it calls problem_constructor(pid::Int64) (for any remote pids and on the current pid)\nstopat::Union{Tuple{Int64, Int64, Float64}, Tuple{Int64, Int64, Float64, Float64}}: (i, e, t) or (i, e, t, p) \ni: maximum number of iterations\ne: maximum number of epochs (all workers have answered at least e times) \nt: maximum starttime t (in seconds) \np: required precision (in terms of distance between the last two queries)\n\nKeywords\n\nsaveat=(0,0)::Tuple{Int64, Int64}: query iterates (::Q) sent by the central nodes are recorded every i > 0 iterations, e > 0 epochs in saveat=(i, e)\nsave_answers=false::Bool: answer iterates (::A) sent by the workers are recorded\npids::Vector{Int64}=workers(): pids of the active workers, you can start a non-distributed (and necessarily synchronous) version of your algorithm with pids=[1]\nsynchronous=false: if synchronous=true, the central node waits for all workers to answer before making a step\ndistance::Function=(x::Q,y::Q)->norm(x-y): function used to compute the distance between the last two queries\nresilience::Int64=0: number of workers allowed to fail before the execution is stopped\nverbose=1: if > 0, a progress bar is displayed\n\nReturns\n\nNamedTuple: a record of the queries and the iterations, epochs, timestamps at which they were recorded, as well as answer_count of each worker (if save_answers is true, the answers will be recorded with their worker provenance in answer_origin)\n\nThrows\n\nArgumentError: if the arguments don't match the specifications.\nstart(algorithm::AbstractAlgorithm{Q,A}, distributedproblem::DistributedObject{M}, stopat::Union{Tuple{Int64, Int64, Float64}, Tuple{Int64, Int64, Float64, Float64}}; saveat=(0,0), saveanswers=false, pids=workers(), synchronous=false, distance::Function=(x::Q,y::Q)->norm(x-y), resilience=0, verbose=1) where {Q,A,M}\n\nSolve the distributed_problem using the algorithm. Similar to the original start function but instead of a problem_constructor::Function, a distributed_problem::DistributedObject should be passed. distributed_problem should reference a problem on the remote pids and on the current pid.\n\n\n\n\n\n","category":"function"},{"location":"documentation/","page":"Documentation","title":"Documentation","text":"start!","category":"page"},{"location":"documentation/#AsynchronousIterativeAlgorithms.start!","page":"Documentation","title":"AsynchronousIterativeAlgorithms.start!","text":"start!(algorithm::AbstractAlgorithm{Q,A}, problem_constructor::Function, stopat::Union{Tuple{Int64, Int64, Float64}, Tuple{Int64, Int64, Float64, Float64}}; saveat=(0,0), save_answers=false, pids=workers(), synchronous=false, distance::Function=(x::Q,y::Q)->norm(x-y), resilience=0, verbose=1) where {Q,A}\n\nSame as start but start! uses a deep copy of your algorithm and won't modify it. This version enables modifications. This can be useful to record information during the execution for example.\n\nstart!(algorithm::AbstractAlgorithm{Q,A}, distributed_problem::DistributedObject{M}, stopat::Union{Tuple{Int64, Int64, Float64}, Tuple{Int64, Int64, Float64, Float64}}; saveat=(0,0), save_answers=false, pids=workers(), synchronous=false, distance::Function=(x::Q,y::Q)->norm(x-y), resilience=0, verbose=1) where {Q,A,M}\n\nSame as start but start! uses a deep copy of your algorithm and won't modify it. This version enables modifications. This can be useful to record information during the execution for example.\n\n\n\n\n\n","category":"function"},{"location":"documentation/#Algorithm","page":"Documentation","title":"Algorithm","text":"","category":"section"},{"location":"documentation/","page":"Documentation","title":"Documentation","text":"AbstractAlgorithm","category":"page"},{"location":"documentation/#AsynchronousIterativeAlgorithms.AbstractAlgorithm","page":"Documentation","title":"AsynchronousIterativeAlgorithms.AbstractAlgorithm","text":"AbstractAlgorithm{Q,A}\n\nTypes subtyping AbstractAlgorithm should be callable with the following signatures:\n\n(algorithm::AbstractAlgorithm{Q,A})(problem::Any) where {Q,A} the initialization step that create the first query iterate q::Q \n(algorithm::AbstractAlgorithm{Q,A})(q::Q, problem::Any) where {Q,A} is the step perfromed by the wokers when they receive a query q::Q from the central node\n(algorithm::AbstractAlgorithm{Q,A})(a::A, worker::Int64, problem::Any) where {Q,A} is the step performed by the central node when receiving an answer a::A from a worker\nwhen start takes the keyword synchronous=true, (algorithm::AbstractAlgorithm{Q,A})(as::Vector{A}, workers::Vector{Int64}, problem::Any) where {Q,A} is the step performed by the central node when receiving the answers as::Vector{A} from all the workers in pids\n\nThey can additionally define:\n\nAsynchronousIterativeAlgorithms.stopnow(algorithm::MyAlgorithm) (with the trait AsynchronousIterativeAlgorithms.Stoppability(::MyAlgorithm) = Stoppable()) to add a stopping condition to start's (iterations, epochs, time) stopping condition\n\n\n\n\n\n","category":"type"},{"location":"documentation/#Algorithm-templates","page":"Documentation","title":"Algorithm templates","text":"","category":"section"},{"location":"documentation/","page":"Documentation","title":"Documentation","text":"AggregationAlgorithm","category":"page"},{"location":"documentation/#AsynchronousIterativeAlgorithms.AggregationAlgorithm","page":"Documentation","title":"AsynchronousIterativeAlgorithms.AggregationAlgorithm","text":"AggregationAlgorithm{Q,A}(initialize::Function, aggregate::Function, query::Function, answer::Function, initial_answer::A; pids=workers()) where {Q,A}\n\nDistributed algorithm that writes: q_j <- query(aggregate([answer(q_i) for i in connected])) Where a \"connected\" worker is a worker that has answered at least once.\n\nThe function parameters should have the following signature \n\ninitialize(problem::Any))\naggregate(a::Vector{A}, workers::Vector{Int64}) where workers lists the provenance of the elements of a \nquery(a::A, problem::Any)\nanswer(q::Q, problem::Any)\n\n(Not memory optimized: length(pids) answers are stored on the central worker at all times)\n\n\n\n\n\n","category":"type"},{"location":"documentation/","page":"Documentation","title":"Documentation","text":"AveragingAlgorithm\n","category":"page"},{"location":"documentation/#AsynchronousIterativeAlgorithms.AveragingAlgorithm","page":"Documentation","title":"AsynchronousIterativeAlgorithms.AveragingAlgorithm","text":"AveragingAlgorithm{Q,A}(initialize::Function,m= query::Function, answer::Function; pids=workers(), weights=ones(length(pids))) where {Q,A}\n\nDistributed algorithm that writes: q_j <- query(weighted_average([answer(q_i) for i in connected])) Where a \"connected\" worker is a worker that has answered at least once.\n\nThe function parameters should have the following signature \n\ninitialize(problem::Any))\nquery(a::A, problem::Any)\nanswer(q::Q, problem::Any)\n\n(Memory optimized: only the equivalent of one answer is stored on the central worker at all times)\n\n\n\n\n\n","category":"type"}]
}
