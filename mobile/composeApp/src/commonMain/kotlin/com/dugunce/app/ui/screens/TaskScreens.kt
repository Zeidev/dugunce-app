package com.dugunce.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material.icons.filled.Timelapse
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.HelperDto
import com.dugunce.app.data.MessageDto
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TaskDto
import com.dugunce.app.ui.components.DateField
import com.dugunce.app.ui.components.DugunceButton
import com.dugunce.app.ui.components.DugunceTextField
import com.dugunce.app.ui.components.EmptyState
import com.dugunce.app.ui.components.ErrorState
import com.dugunce.app.ui.components.LoadingState
import com.dugunce.app.ui.components.SegmentedPicker
import com.dugunce.app.ui.components.StatusChip
import com.dugunce.app.ui.components.StatusTone
import com.dugunce.app.ui.components.TopBar
import com.dugunce.app.ui.theme.DugunceTheme
import com.dugunce.app.ui.theme.Radius
import com.dugunce.app.ui.theme.Spacing
import com.dugunce.app.util.Dates
import com.dugunce.app.util.nowMillis
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Görev listesi — brief §5.7.
 *
 * Filtre: durum, sorumlu (spec §6b.7).
 */
@Composable
fun TaskListScreen(
    repository: Repository,
    weddingId: String,
    onAddTask: () -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenHelpers: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var tasks by remember { mutableStateOf<List<TaskDto>>(emptyList()) }
    var helpers by remember { mutableStateOf<List<HelperDto>>(emptyList()) }
    var reloadKey by remember { mutableStateOf(0) }
    var filterStatus by remember { mutableStateOf<String?>(null) }
    var filterHelper by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(weddingId, reloadKey) {
        loading = true
        error = null
        val t = repository.listTasks(weddingId)
        val h = repository.listHelpers(weddingId)
        if (t.isFailure) {
            error = t.exceptionOrNull()?.message ?: "Görevler yüklenemedi"
            loading = false
            return@LaunchedEffect
        }
        tasks = t.getOrNull() ?: emptyList()
        helpers = h.getOrNull() ?: emptyList()
        loading = false
    }

    val filtered = tasks.filter { t ->
        (filterStatus == null || t.status == filterStatus) &&
            (filterHelper == null || t.assigneeHelperId == filterHelper)
    }
    val helperName = { id: String? -> helpers.find { it.id == id }?.displayName }

    Box(Modifier.fillMaxSize().background(c.cream)) {
        when {
            loading -> LoadingState(Modifier.fillMaxSize(), "Görevler yükleniyor…")
            error != null -> ErrorState(error!!, onRetry = { reloadKey++ }, modifier = Modifier.fillMaxSize())

            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    horizontal = Spacing.screenH,
                    vertical = Spacing.md,
                ),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "${tasks.count { it.status != "DONE" }} açık görev",
                            style = MaterialTheme.typography.titleMedium,
                            color = c.ink,
                        )
                        com.dugunce.app.ui.components.TextAction("Yardımcılar", onOpenHelpers)
                    }
                }

                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        item { TaskFilter("Tümü", filterStatus == null) { filterStatus = null } }
                        item { TaskFilter("Yapılacak", filterStatus == "TODO") { filterStatus = "TODO" } }
                        item { TaskFilter("Devam", filterStatus == "DOING") { filterStatus = "DOING" } }
                        item { TaskFilter("Bitti", filterStatus == "DONE") { filterStatus = "DONE" } }
                    }
                }

                if (helpers.isNotEmpty()) {
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                            item { TaskFilter("Herkes", filterHelper == null) { filterHelper = null } }
                            items(helpers) { h ->
                                TaskFilter(h.displayName, filterHelper == h.id) { filterHelper = h.id }
                            }
                        }
                    }
                }

                when {
                    tasks.isEmpty() -> item {
                        EmptyState(
                            title = "Henüz görev yok",
                            description = "Hazırlık işlerini görevlere böl. Yardımcına atadığında " +
                                "o da kendi linkinden görür.",
                            icon = Icons.Filled.TaskAlt,
                            actionLabel = "Görev ekle",
                            onAction = onAddTask,
                        )
                    }
                    filtered.isEmpty() -> item {
                        EmptyState(
                            title = "Sonuç yok",
                            description = "Bu filtreye uyan görev bulunamadı.",
                            icon = Icons.Filled.TaskAlt,
                        )
                    }
                    else -> items(filtered, key = { it.id }) { task ->
                        TaskRow(task, helperName(task.assigneeHelperId)) { onOpenTask(task.id) }
                    }
                }

                item { Spacer(Modifier.height(Spacing.xxl)) }
            }
        }

        if (!loading && error == null) {
            Surface(
                onClick = onAddTask,
                modifier = Modifier.align(Alignment.BottomEnd).padding(Spacing.lg),
                shape = RoundedCornerShape(Radius.pill),
                color = c.sage,
                shadowElevation = 6.dp,
            ) {
                Row(
                    Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(Spacing.sm))
                    Text(
                        "Görev",
                        color = Color.White,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
private fun TaskFilter(label: String, selected: Boolean, onClick: () -> Unit) {
    val c = DugunceTheme.colors
    Surface(
        onClick = onClick,
        modifier = Modifier.heightIn(min = 36.dp),
        shape = RoundedCornerShape(Radius.pill),
        color = if (selected) c.sageSoft else c.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) c.sage else c.line),
    ) {
        Box(Modifier.padding(horizontal = Spacing.md), contentAlignment = Alignment.Center) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) c.sage else c.inkSoft,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

@Composable
private fun TaskRow(task: TaskDto, assignee: String?, onClick: () -> Unit) {
    val c = DugunceTheme.colors
    val done = task.status == "DONE"
    com.dugunce.app.ui.components.DugunceCard(onClick = onClick) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    task.title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (done) c.muted else c.ink,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(Spacing.sm))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    StatusChip(taskStatusLabel(task.status), taskStatusTone(task.status), taskStatusIcon(task.status))
                    if (task.priority == "HIGH") StatusChip("Öncelikli", StatusTone.DANGER)
                    if (assignee != null) StatusChip(assignee, StatusTone.INFO, Icons.Filled.Person)
                }
                if (task.dueDate != null) {
                    Spacer(Modifier.height(Spacing.xs))
                    Text(
                        Dates.formatDate(task.dueDate),
                        style = MaterialTheme.typography.bodySmall,
                        color = c.muted,
                    )
                }
            }
        }
    }
}

internal fun taskStatusLabel(status: String?): String = when (status) {
    "TODO" -> "Yapılacak"
    "DOING" -> "Devam ediyor"
    "DONE" -> "Bitti"
    else -> "—"
}

internal fun taskStatusTone(status: String?): StatusTone = when (status) {
    "DONE" -> StatusTone.SUCCESS
    "DOING" -> StatusTone.INFO
    else -> StatusTone.NEUTRAL
}

internal fun taskStatusIcon(status: String?): androidx.compose.ui.graphics.vector.ImageVector = when (status) {
    "DONE" -> Icons.Filled.CheckCircle
    "DOING" -> Icons.Filled.Timelapse
    else -> Icons.Filled.RadioButtonUnchecked
}

/**
 * Görev formu — brief §5.7.
 *
 * Başlık, açıklama, son tarih, öncelik, durum, atama.
 */
@Composable
fun TaskFormScreen(
    repository: Repository,
    weddingId: String,
    taskId: String?,
    existing: TaskDto?,
    helpers: List<HelperDto>,
    onBack: () -> Unit,
    onSaved: () -> Unit,
) {
    val c = DugunceTheme.colors
    var title by remember { mutableStateOf(existing?.title ?: "") }
    var description by remember { mutableStateOf(existing?.description ?: "") }
    var status by remember { mutableStateOf(existing?.status ?: "TODO") }
    var priority by remember { mutableStateOf(existing?.priority ?: "NORMAL") }
    var dueText by remember { mutableStateOf(Dates.formatShort(existing?.dueDate)) }
    var helperId by remember { mutableStateOf(existing?.assigneeHelperId) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val isoDue = if (dueText.isBlank()) null else parseTurkishDate(dueText)

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar(if (taskId == null) "Yeni görev" else "Görevi düzenle", onBack = onBack)

        LazyColumn(
            Modifier.weight(1f).imePadding(),
            contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                DugunceTextField(
                    value = title,
                    onValueChange = { title = it; error = null },
                    label = "Başlık",
                    placeholder = "Nikah şahidini ara",
                    enabled = !saving,
                )
            }
            item {
                DugunceTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = "Açıklama (isteğe bağlı)",
                    singleLine = false,
                    minLines = 3,
                    enabled = !saving,
                )
            }
            item {
                DateField(
                    value = dueText,
                    onClick = { },
                    label = "Son tarih (isteğe bağlı)",
                    error = if (dueText.isNotBlank() && isoDue == null) "gg.aa.yyyy biçiminde gir" else null,
                )
            }
            item {
                FieldLabel("Durum")
                SegmentedPicker(
                    options = listOf("TODO" to "Yapılacak", "DOING" to "Devam", "DONE" to "Bitti"),
                    selected = status,
                    onSelect = { status = it },
                )
            }
            item {
                FieldLabel("Öncelik")
                SegmentedPicker(
                    options = listOf("LOW" to "Düşük", "NORMAL" to "Normal", "HIGH" to "Yüksek"),
                    selected = priority,
                    onSelect = { priority = it },
                )
            }
            if (helpers.isNotEmpty()) {
                item {
                    FieldLabel("Sorumlu")
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        item {
                            TaskFilter("Atanmadı", helperId == null) { helperId = null }
                        }
                        items(helpers) { h ->
                            TaskFilter(h.displayName, helperId == h.id) { helperId = h.id }
                        }
                    }
                }
            }
            if (error != null) {
                item { Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger) }
            }
            item { Spacer(Modifier.height(Spacing.xxl)) }
        }

        Column(Modifier.padding(horizontal = Spacing.screenH, vertical = Spacing.md)) {
            DugunceButton(
                if (taskId == null) "Görevi oluştur" else "Kaydet",
                onClick = {
                    if (title.trim().isEmpty() || saving) return@DugunceButton
                    saving = true
                    error = null
                    scope.launch {
                        val result = if (taskId == null) {
                            repository.createTask(
                                weddingId,
                                com.dugunce.app.data.TaskCreateRequest(
                                    title = title.trim(),
                                    description = description.trim().ifBlank { null },
                                    status = status,
                                    priority = priority,
                                    dueDate = isoDue,
                                ),
                            ).map { it.id }
                        } else {
                            repository.updateTask(
                                weddingId,
                                taskId,
                                com.dugunce.app.data.TaskPatchRequest(
                                    title = title.trim(),
                                    description = description.trim().ifBlank { null },
                                    status = status,
                                    priority = priority,
                                    dueDate = isoDue,
                                ),
                            ).map { it.id }
                        }

                        result.fold(
                            onSuccess = { newId ->
                                // Atama ayrı uçtan
                                if (taskId == null || existing?.assigneeHelperId != helperId) {
                                    repository.assignTask(weddingId, newId, helperId)
                                }
                                saving = false
                                onSaved()
                            },
                            onFailure = { e ->
                                saving = false
                                error = if (e is com.dugunce.app.api.ApiException) e.message else "Kaydedilemedi"
                            },
                        )
                    }
                },
                enabled = title.trim().isNotEmpty(),
                loading = saving,
            )
        }
    }
}

/**
 * Görev detayı — brief §5.7.
 *
 * Detay + durum değiştir + sohbete git.
 */
@Composable
fun TaskDetailScreen(
    repository: Repository,
    weddingId: String,
    taskId: String,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onOpenChat: () -> Unit,
    onDeleted: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var task by remember { mutableStateOf<TaskDto?>(null) }
    var helperName by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(taskId, reloadKey) {
        loading = true
        repository.listTasks(weddingId).fold(
            onSuccess = { list ->
                task = list.find { it.id == taskId }
                loading = false
            },
            onFailure = { error = it.message; loading = false },
        )
        repository.listHelpers(weddingId).onSuccess { hs ->
            helperName = hs.find { it.id == task?.assigneeHelperId }?.displayName
        }
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Görev", onBack = onBack, actionLabel = "Düzenle", onAction = onEdit)

        when {
            loading -> LoadingState(Modifier.fillMaxSize())
            error != null -> ErrorState(error!!, modifier = Modifier.fillMaxSize())
            task == null -> EmptyState(
                title = "Görev bulunamadı",
                description = "Bu görev silinmiş olabilir.",
                icon = Icons.Filled.TaskAlt,
                modifier = Modifier.fillMaxSize(),
            )
            else -> {
                val t = task!!
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
                    verticalArrangement = Arrangement.spacedBy(Spacing.md),
                ) {
                    item {
                        Surface(
                            shape = RoundedCornerShape(Radius.lg),
                            color = c.surface,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(Modifier.padding(Spacing.lg)) {
                                Text(
                                    t.title,
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = c.ink,
                                )
                                Spacer(Modifier.height(Spacing.sm))
                                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                                    StatusChip(taskStatusLabel(t.status), taskStatusTone(t.status), taskStatusIcon(t.status))
                                    if (t.priority == "HIGH") StatusChip("Öncelikli", StatusTone.DANGER)
                                }
                                if (!t.description.isNullOrBlank()) {
                                    Spacer(Modifier.height(Spacing.md))
                                    Text(
                                        t.description!!,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = c.inkSoft,
                                    )
                                }
                                if (t.dueDate != null) {
                                    Spacer(Modifier.height(Spacing.md))
                                    Text(
                                        "Son tarih: ${Dates.formatDate(t.dueDate)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.muted,
                                    )
                                }
                                if (helperName != null) {
                                    Spacer(Modifier.height(Spacing.xs))
                                    Text(
                                        "Sorumlu: $helperName",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = c.muted,
                                    )
                                }
                            }
                        }
                    }

                    item {
                        FieldLabel("Durumu değiştir")
                        SegmentedPicker(
                            options = listOf("TODO" to "Yapılacak", "DOING" to "Devam", "DONE" to "Bitti"),
                            selected = t.status,
                            onSelect = { newStatus ->
                                scope.launch {
                                    repository.updateTaskStatus(weddingId, taskId, newStatus)
                                    reloadKey++
                                }
                            },
                        )
                    }

                    item {
                        DugunceButton("Görev sohbeti", onClick = onOpenChat, variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY)
                    }

                    item {
                        Spacer(Modifier.height(Spacing.lg))
                        if (!confirmDelete) {
                            DugunceButton(
                                "Görevi sil",
                                onClick = { confirmDelete = true },
                                variant = com.dugunce.app.ui.components.ButtonVariant.DANGER,
                            )
                        } else {
                            Surface(
                                shape = RoundedCornerShape(Radius.md),
                                color = c.dangerSoft,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(Modifier.padding(Spacing.md)) {
                                    Text(
                                        "Bu görev ve sohbeti silinsin mi?",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = c.danger,
                                    )
                                    Spacer(Modifier.height(Spacing.sm))
                                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                        DugunceButton(
                                            "Evet, sil",
                                            onClick = {
                                                scope.launch {
                                                    repository.deleteTask(weddingId, taskId).fold(
                                                        onSuccess = { onDeleted() },
                                                        onFailure = { err ->
                                                            error = err.message
                                                            confirmDelete = false
                                                        },
                                                    )
                                                }
                                            },
                                            variant = com.dugunce.app.ui.components.ButtonVariant.DANGER,
                                            modifier = Modifier.weight(1f),
                                        )
                                        DugunceButton(
                                            "Vazgeç",
                                            onClick = { confirmDelete = false },
                                            variant = com.dugunce.app.ui.components.ButtonVariant.SECONDARY,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                            }
                        }
                    }

                    item { Spacer(Modifier.height(Spacing.xxl)) }
                }
            }
        }
    }
}

/**
 * Görev sohbeti — brief §5.7.
 *
 * Polling (spec §10.3 #7): WebSocket yok, serv00'da sürekli süreç
 * çalıştırmıyoruz. 15 saniyede bir yenilenir.
 */
@Composable
fun TaskChatScreen(
    repository: Repository,
    weddingId: String,
    taskId: String,
    onBack: () -> Unit,
) {
    val c = DugunceTheme.colors
    var messages by remember { mutableStateOf<List<MessageDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    suspend fun refresh() {
        repository.listMessages(weddingId, taskId).fold(
            onSuccess = {
                messages = it
                loading = false
                error = null
            },
            onFailure = {
                error = it.message
                loading = false
            },
        )
    }

    LaunchedEffect(taskId) {
        refresh()
        // Polling — sayfa açıkken 15 sn
        while (true) {
            delay(15_000)
            refresh()
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(0)
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Görev sohbeti", onBack = onBack)

        Box(Modifier.weight(1f)) {
            when {
                loading -> LoadingState(Modifier.fillMaxSize())
                error != null -> ErrorState(error!!, onRetry = { scope.launch { refresh() } }, modifier = Modifier.fillMaxSize())
                messages.isEmpty() -> EmptyState(
                    title = "Sohbet boş",
                    description = "Bu görev hakkında not bırak. Yardımcın da aynı sohbeti görür.",
                    icon = Icons.Filled.Send,
                    modifier = Modifier.fillMaxSize(),
                )
                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.md),
                    verticalArrangement = Arrangement.spacedBy(Spacing.sm),
                    reverseLayout = true,
                ) {
                    items(messages, key = { it.id }) { msg ->
                        MessageBubble(msg)
                    }
                }
            }
        }

        // Giriş
        Surface(color = c.surface, shadowElevation = 8.dp) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .imePadding()
                    .padding(horizontal = Spacing.sm, vertical = Spacing.sm),
                verticalAlignment = Alignment.Bottom,
            ) {
                DugunceTextField(
                    value = input,
                    onValueChange = { if (it.length <= 4000) input = it },
                    label = "Mesaj",
                    modifier = Modifier.weight(1f),
                    singleLine = false,
                    minLines = 1,
                    imeAction = ImeAction.Default,
                    enabled = !sending,
                )
                IconButton(
                    onClick = {
                        val text = input.trim()
                        if (text.isEmpty() || sending) return@IconButton
                        sending = true
                        scope.launch {
                            // Ağ tekrarında kopya olmasın
                            val key = "$taskId-${nowMillis()}-${text.length}"
                            repository.sendMessage(weddingId, taskId, text, key).fold(
                                onSuccess = { msg ->
                                    messages = listOf(msg) + messages
                                    input = ""
                                    sending = false
                                },
                                onFailure = {
                                    sending = false
                                    error = "Mesaj gönderilemedi"
                                },
                            )
                        }
                    },
                ) {
                    Icon(
                        Icons.Filled.Send,
                        contentDescription = "Gönder",
                        tint = if (input.isNotBlank() && !sending) c.sage else c.muted,
                    )
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(msg: MessageDto) {
    val c = DugunceTheme.colors
    val mine = msg.senderKind == "COUPLE"
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = Radius.lg,
                topEnd = Radius.lg,
                bottomStart = if (mine) Radius.lg else Radius.sm,
                bottomEnd = if (mine) Radius.sm else Radius.lg,
            ),
            color = if (mine) c.sage else c.surface,
            modifier = Modifier.fillMaxWidth(0.8f),
        ) {
            Column(Modifier.padding(Spacing.md)) {
                Text(
                    msg.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (mine) Color.White else c.ink,
                )
                Spacer(Modifier.height(Spacing.xxs))
                Text(
                    Dates.formatTime(msg.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (mine) c.sageSoft else c.muted,
                )
            }
        }
    }
}

/** Yardımcı listesi — brief §5.7. */
@Composable
fun HelperListScreen(
    repository: Repository,
    weddingId: String,
    onBack: () -> Unit,
    onInvite: () -> Unit,
) {
    val c = DugunceTheme.colors
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var helpers by remember { mutableStateOf<List<HelperDto>>(emptyList()) }
    var reloadKey by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(weddingId, reloadKey) {
        loading = true
        repository.listHelpers(weddingId).fold(
            onSuccess = { helpers = it; loading = false; error = null },
            onFailure = { error = it.message; loading = false },
        )
    }

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Yardımcılar", onBack = onBack, actionLabel = "Ekle", onAction = onInvite)

        when {
            loading -> LoadingState(Modifier.fillMaxSize())
            error != null -> ErrorState(error!!, onRetry = { reloadKey++ }, modifier = Modifier.fillMaxSize())
            helpers.isEmpty() -> EmptyState(
                title = "Henüz yardımcı yok",
                description = "Yardımcı ekle, görev ata. Uygulama kurmasına gerek yok — " +
                    "sana özel linkle kendi görevlerini görür.",
                icon = Icons.Filled.Person,
                actionLabel = "Yardımcı ekle",
                onAction = onInvite,
                modifier = Modifier.fillMaxSize(),
            )
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.md),
                verticalArrangement = Arrangement.spacedBy(Spacing.md),
            ) {
                items(helpers, key = { it.id }) { h ->
                    val revoked = h.tokenRevokedAt != null
                    com.dugunce.app.ui.components.DugunceCard {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    h.displayName,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = c.ink,
                                    fontWeight = FontWeight.Medium,
                                )
                                Spacer(Modifier.height(Spacing.xs))
                                StatusChip(
                                    if (revoked) "Erişim kapalı" else "Aktif",
                                    if (revoked) StatusTone.DANGER else StatusTone.SUCCESS,
                                )
                            }
                            if (!revoked) {
                                com.dugunce.app.ui.components.TextAction("İptal et") {
                                    scope.launch {
                                        repository.revokeHelper(weddingId, h.id)
                                        reloadKey++
                                    }
                                }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(Spacing.xxl)) }
            }
        }
    }
}

/** Yardımcı davet — token linki göster. */
@Composable
fun HelperInviteScreen(
    repository: Repository,
    weddingId: String,
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
) {
    val c = DugunceTheme.colors
    var name by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var createdUrl by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().background(c.cream)) {
        TopBar("Yardımcı ekle", onBack = onBack)

        LazyColumn(
            Modifier.weight(1f).imePadding(),
            contentPadding = PaddingValues(horizontal = Spacing.screenH, vertical = Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            item {
                Surface(
                    shape = RoundedCornerShape(Radius.md),
                    color = c.infoSoft,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "Yardımcı uygulama kurmaz, hesap açmaz. Sana özel linke " +
                            "tıklayınca kendi görevlerini görür. Link 90 gün geçerli.",
                        style = MaterialTheme.typography.bodySmall,
                        color = c.info,
                        modifier = Modifier.padding(Spacing.md),
                    )
                }
            }
            item {
                DugunceTextField(
                    value = name,
                    onValueChange = { name = it; error = null },
                    label = "Yardımcının adı",
                    placeholder = "Ayşe",
                    helper = "Görev listesinde bu isim görünür",
                    enabled = !saving,
                )
            }

            if (createdUrl != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(Radius.md),
                        color = c.successSoft,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(Spacing.md)) {
                            Text(
                                "Link hazır",
                                style = MaterialTheme.typography.labelLarge,
                                color = c.success,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(Spacing.xs))
                            Text(
                                createdUrl!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = c.inkSoft,
                            )
                            Spacer(Modifier.height(Spacing.sm))
                            Text(
                                "Bu linki WhatsApp'tan gönder. Bir daha gösterilmez.",
                                style = MaterialTheme.typography.bodySmall,
                                color = c.muted,
                            )
                        }
                    }
                }
            }

            if (error != null) {
                item { Text(error!!, style = MaterialTheme.typography.bodySmall, color = c.danger) }
            }
            item { Spacer(Modifier.height(Spacing.xxl)) }
        }

        Column(Modifier.padding(horizontal = Spacing.screenH, vertical = Spacing.md)) {
            if (createdUrl == null) {
                DugunceButton(
                    "Yardımcı oluştur",
                    onClick = {
                        if (name.trim().isEmpty() || saving) return@DugunceButton
                        saving = true
                        error = null
                        scope.launch {
                            repository.createHelper(weddingId, name.trim()).fold(
                                onSuccess = { res ->
                                    saving = false
                                    val url = res.url ?: res.token?.let { "https://dugunce.com.tr/h#$it" }
                                    createdUrl = url
                                    if (url != null) onCreated(url)
                                },
                                onFailure = { e ->
                                    saving = false
                                    error = if (e is com.dugunce.app.api.ApiException) e.message else "Oluşturulamadı"
                                },
                            )
                        }
                    },
                    enabled = name.trim().isNotEmpty(),
                    loading = saving,
                )
            } else {
                DugunceButton("Tamam", onClick = onBack)
            }
        }
    }
}
