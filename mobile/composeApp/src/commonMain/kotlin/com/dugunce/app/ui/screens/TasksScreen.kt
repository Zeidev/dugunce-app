package com.dugunce.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dugunce.app.data.Repository
import com.dugunce.app.data.TaskDto
import com.dugunce.app.ui.theme.DugunceColors
import kotlinx.coroutines.launch

@Composable
fun TasksScreen(
    repository: Repository,
    weddingId: String,
) {
    var tasks by remember { mutableStateOf<List<TaskDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        tasks = repository.listTasks(weddingId).getOrNull() ?: emptyList()
    }

    LaunchedEffect(weddingId) {
        loading = true
        reload()
        loading = false
    }

    if (loading) {
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CircularProgressIndicator(color = DugunceColors.Accent)
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                text = "Görevler",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = 20.dp, bottom = 4.dp),
            )
        }

        if (tasks.isEmpty()) {
            item {
                Text(
                    text = "Henüz görev yok.",
                    color = DugunceColors.Muted,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
            }
        }

        items(tasks) { task ->
            TaskRow(
                task = task,
                onStatusChange = { newStatus ->
                    scope.launch {
                        repository.updateTaskStatus(weddingId, task.id, newStatus)
                        reload()
                    }
                },
            )
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun TaskRow(task: TaskDto, onStatusChange: (String) -> Unit) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = DugunceColors.Surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = task.title,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        color = DugunceColors.Ink,
                    )
                    task.description?.let { d ->
                        Text(
                            text = d,
                            style = MaterialTheme.typography.bodySmall,
                            color = DugunceColors.Muted,
                        )
                    }
                }
                if (task.assigneeHelperId != null) {
                    Text(
                        text = "Atanmış",
                        style = MaterialTheme.typography.labelSmall,
                        color = DugunceColors.Accent,
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (status in listOf("TODO", "DOING", "DONE")) {
                    FilterChip(
                        selected = task.status == status,
                        onClick = { if (task.status != status) onStatusChange(status) },
                        label = { Text(statusLabel(status)) },
                    )
                }
            }
        }
    }
}

private fun statusLabel(status: String): String = when (status) {
    "TODO" -> "Yapılacak"
    "DOING" -> "Yapılıyor"
    "DONE" -> "Bitti"
    else -> status
}
